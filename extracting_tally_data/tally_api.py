"""
tally_api.py — FastAPI server with a single global semantic search endpoint.
Run: uvicorn tally_api:app --reload --port 8000

Frontend sends any natural-language query → API searches ChromaDB
collections by vector similarity → returns the best matches.

Supports optional metadata filters (amount, date, customer, voucher_type).
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import chromadb
import os

# ── CHROMA SETUP ──────────────────────────────────────────────────────────────

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
CHROMA_DIR = os.path.join(BASE_DIR, "chroma_db")

chroma = chromadb.PersistentClient(path=CHROMA_DIR)

COLLECTION_NAMES = ["sales", "day_book", "ledgers", "groups", "stock_items"]

# ── APP ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="VoiceTally API", version="2.0")

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
    collection: Optional[str] = None            # search only one collection: "sales", "ledgers", etc.
    customer: Optional[str] = None              # filter by customer name
    voucher_type: Optional[str] = None          # filter by voucher type: "Sales", "Purchase", "Payment"
    min_amount: Optional[float] = None          # amount >= this value
    max_amount: Optional[float] = None          # amount <= this value
    from_date: Optional[str] = None             # date >= this (format: "YYYY-MM-DD")
    to_date: Optional[str] = None               # date <= this (format: "YYYY-MM-DD")


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


# ── ROUTES ────────────────────────────────────────────────────────────────────

@app.get("/")
def health():
    """Health check — returns record count per collection."""
    counts = {}
    for name in COLLECTION_NAMES:
        try:
            counts[name] = chroma.get_collection(name).count()
        except Exception:
            counts[name] = 0
    return {"status": "ok", "collections": counts}


@app.post("/search")
def search(req: SearchRequest):
    """
    Single global endpoint — searches collections by vector similarity
    with optional metadata filters.

    ── Basic usage (no filters): ──
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
    # Decide which collections to search
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

        # Build query kwargs
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
            # Filter fields may not exist in this collection — skip it
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

    # Sort by relevance (highest first) and return top_k overall
    all_results.sort(key=lambda r: r["relevance"], reverse=True)
    top_results = all_results[: req.top_k]

    return {
        "query": req.query,
        "result_count": len(top_results),
        "results": top_results,
    }

# ok so now we can either do just this, { "query": "sundry debtors", "top_k": 5 }
# if no filter 
# and with filters these all
# {
#   "query": "sales invoice",
#   "collection": "sales",
#   "customer": "ABC Traders",
#   "min_amount": 5000,
#   "from_date": "2024-01-01",
#   "to_date": "2024-12-31",
#   "top_k": 10
# }


#frontend must sent structured json
#else use NLP layer-to make it into this format