"""
tally_api.py — FastAPI server with:
  1. POST /search     → vector search with optional filters
  2. GET  /           → health check
  3. WS   /ws         → WebSocket for live dashboard updates
  4. Background task  → polls Tally every 60s, syncs to ChromaDB, notifies dashboards

Run: uvicorn tally_api:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from contextlib import asynccontextmanager
import chromadb
import asyncio
import json
import os
import logging

# Import sync functions from tally_to_vector.py
from tally_to_vector import (
    fetch_all_masters,
    extract_groups,
    extract_ledgers,
    extract_stock_items,
    extract_day_book,
    post_xml,
    COMPANY_NAME,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voicetally")

# ── CHROMA SETUP ──────────────────────────────────────────────────────────────

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
CHROMA_DIR = os.path.join(BASE_DIR, "chroma_db")

chroma = chromadb.PersistentClient(path=CHROMA_DIR)

COLLECTION_NAMES = ["sales", "day_book", "ledgers", "groups", "stock_items"]

# ── POLLING CONFIG ────────────────────────────────────────────────────────────

POLL_INTERVAL_SECONDS = 60  # Check Tally every 60 seconds
last_known_timestamp  = None  # Tracks last altered timestamp from Tally

# ── WEBSOCKET MANAGER ────────────────────────────────────────────────────────

class ConnectionManager:
    """Manages all connected WebSocket dashboard clients."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active_connections.append(ws)
        logger.info(f"📡 Dashboard connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, ws: WebSocket):
        self.active_connections.remove(ws)
        logger.info(f"📡 Dashboard disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Send a message to ALL connected dashboards."""
        dead = []
        for ws in self.active_connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_connections.remove(ws)


manager = ConnectionManager()

# ── TALLY CHANGE DETECTION ───────────────────────────────────────────────────

def get_tally_last_altered() -> str | None:
    """
    Ask Tally for the company's LASTINVENTORYENTRYDATE or LASTVOUCHERDATE.
    This is a lightweight XML call — if the timestamp changes,
    it means someone entered/modified data in Tally.
    """
    body = f"""<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""
    root = post_xml(body)
    if root is None:
        return None

    # Try to find a timestamp that changes when data is altered
    # In TallyPrime, we look for Bill Dates from the List of Accounts
    for tag in ["LASTINVENTORYENTRYDATE", "LASTVOUCHERDATE", "LASTMASTERALTEREDDATE", "BILLDATE"]:
        val = root.findtext(f".//{tag}")
        if val:
            return val.strip()

    return None


async def poll_tally_and_sync():
    """
    Background task: every POLL_INTERVAL_SECONDS,
    check if Tally data changed → sync to ChromaDB → notify dashboards.
    """
    global last_known_timestamp

    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)

        try:
            current_timestamp = get_tally_last_altered()

            if current_timestamp is None:
                logger.warning("⚠️  Cannot reach Tally — skipping this cycle.")
                continue

            if current_timestamp == last_known_timestamp:
                logger.info("✅ No changes in Tally — skipping sync.")
                continue

            # Data changed! Re-sync.
            logger.info(f"🔄 Tally data changed ({last_known_timestamp} → {current_timestamp}). Syncing...")

            # Run the sync (these are blocking calls, run in thread)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, _sync_tally_to_chroma)

            last_known_timestamp = current_timestamp

            # Notify all connected dashboards
            await manager.broadcast({
                "type": "data_updated",
                "message": "Tally data has been updated",
                "timestamp": current_timestamp,
            })

            logger.info(f"✅ Sync complete. Notified {len(manager.active_connections)} dashboard(s).")

        except Exception as e:
            logger.error(f"❌ Polling error: {e}")


def _sync_tally_to_chroma():
    """Run the full Tally → ChromaDB sync (called from background task)."""
    masters = fetch_all_masters()
    if masters is not None:
        extract_groups(masters)
        extract_ledgers(masters)
        extract_stock_items(masters)
    extract_day_book()


# ── APP LIFESPAN (starts background task) ────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the Tally polling background task when the server starts."""
    global last_known_timestamp
    # Set initial timestamp so we don't re-sync immediately on startup
    last_known_timestamp = get_tally_last_altered()
    logger.info(f"🚀 Initial Tally timestamp: {last_known_timestamp}")
    logger.info(f"🔁 Polling Tally every {POLL_INTERVAL_SECONDS}s for changes...")

    task = asyncio.create_task(poll_tally_and_sync())
    yield
    task.cancel()


# ── APP ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="VoiceTally API", version="3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── REQUEST MODEL ────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str                                  # natural language text
    top_k: int = 10                             # max results

    # ── Optional filters ──
    collection: Optional[str] = None            # search only one collection
    customer: Optional[str] = None              # filter by customer name
    voucher_type: Optional[str] = None          # filter by voucher type
    min_amount: Optional[float] = None          # amount >= this value
    max_amount: Optional[float] = None          # amount <= this value
    from_date: Optional[str] = None             # date >= this (YYYY-MM-DD)
    to_date: Optional[str] = None               # date <= this (YYYY-MM-DD)


# ── HELPER ───────────────────────────────────────────────────────────────────

def build_where_filter(req: SearchRequest) -> dict | None:
    """Build a ChromaDB 'where' filter from the optional fields."""
    conditions = []

    if req.customer:
        conditions.append({"customer": {"$eq": req.customer}})
    if req.voucher_type:
        conditions.append({"voucher_type": {"$eq": req.voucher_type}})
    if req.min_amount is not None:
        conditions.append({"amount": {"$gte": req.min_amount}})
    if req.max_amount is not None:
        conditions.append({"amount": {"$lte": req.max_amount}})
    if req.from_date:
        conditions.append({"date": {"$gte": req.from_date}})
    if req.to_date:
        conditions.append({"date": {"$lte": req.to_date}})

    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


# ═════════════════════════════════════════════════════════════════════════════
#  ROUTES
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/")
def health():
    """Health check — returns record count per collection + sync status."""
    counts = {}
    for name in COLLECTION_NAMES:
        try:
            counts[name] = chroma.get_collection(name).count()
        except Exception:
            counts[name] = 0
    return {
        "status": "ok",
        "collections": counts,
        "last_tally_sync": last_known_timestamp,
        "connected_dashboards": len(manager.active_connections),
        "poll_interval_seconds": POLL_INTERVAL_SECONDS,
    }


@app.post("/search")
def search(req: SearchRequest):
    """
    Single global endpoint — searches collections by vector similarity
    with optional metadata filters.

    ── Basic (no filters): ──
    POST /search
    { "query": "sundry debtors", "top_k": 5 }

    ── With filters: ──
    POST /search
    {
      "query": "sales invoice",
      "top_k": 10,
      "collection": "sales",
      "customer": "ABC Traders",
      "min_amount": 5000,
      "from_date": "2024-01-01",
      "to_date": "2024-12-31"
    }
    """
    if req.collection:
        if req.collection not in COLLECTION_NAMES:
            raise HTTPException(status_code=400, detail=f"Unknown collection '{req.collection}'. Choose from: {COLLECTION_NAMES}")
        search_collections = [req.collection]
    else:
        search_collections = COLLECTION_NAMES

    where_filter = build_where_filter(req)
    all_results  = []

    for name in search_collections:
        try:
            collection = chroma.get_collection(name)
        except Exception:
            continue

        count = collection.count()
        if count == 0:
            continue

        n = min(req.top_k, count)

        query_kwargs = {
            "query_texts": [req.query],
            "n_results": n,
            "include": ["documents", "metadatas", "distances"],
        }
        if where_filter:
            query_kwargs["where"] = where_filter

        try:
            res = collection.query(**query_kwargs)
        except Exception:
            continue

        for doc, meta, dist in zip(
            res["documents"][0],
            res["metadatas"][0],
            res["distances"][0],
        ):
            all_results.append({
                "collection": name,
                "summary": doc,
                "relevance": round(1 - dist, 3),
                **meta,
            })

    all_results.sort(key=lambda r: r["relevance"], reverse=True)
    top_results = all_results[: req.top_k]

    return {
        "query": req.query,
        "result_count": len(top_results),
        "results": top_results,
    }


# ── WEBSOCKET ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    Dashboard connects here to receive live updates.

    Frontend usage:
        const ws = new WebSocket("ws://localhost:8000/ws");
        ws.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === "data_updated") {
                refreshDashboard();
            }
        };
    """
    await manager.connect(ws)
    try:
        while True:
            # Keep connection alive — listen for any messages from frontend
            data = await ws.receive_text()
            # Frontend can send a ping, we just acknowledge
            await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(ws)