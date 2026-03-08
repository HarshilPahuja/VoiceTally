"""
tally_api.py — FastAPI server: Frontend → API → ChromaDB → Frontend
Run: uvicorn tally_api:app --reload --port 8000

"""

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
import chromadb
import os
import re

# ── CHROMA SETUP ──────────────────────────────────────────────────────────────

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
CHROMA_DIR = os.path.join(BASE_DIR, "chroma_db")

chroma = chromadb.PersistentClient(path=CHROMA_DIR)

def col(name: str):
    try:
        return chroma.get_collection(name)
    except Exception:
        raise HTTPException(
            status_code=404,
            detail=f"Collection '{name}' not found. Run tally_to_vector.py first."
        )

# ── APP ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="VoiceTally API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── HELPERS ───────────────────────────────────────────────────────────────────

def chroma_get(collection: str, where: dict = None, limit: int = 200) -> list[dict]:
    """Fetch rows by metadata filter."""
    c      = col(collection)
    kwargs = {"include": ["documents", "metadatas"], "limit": limit}
    if where:
        kwargs["where"] = where
    res    = c.get(**kwargs)
    return [{"summary": doc, **meta}
            for doc, meta in zip(res["documents"], res["metadatas"])]


def chroma_search(collection: str, query: str, top_k: int = 5) -> list[dict]:
    """Semantic vector search."""
    c = col(collection)
    n = min(top_k, c.count())
    if n == 0:
        return []
    res = c.query(
        query_texts=[query],
        n_results=n,
        include=["documents", "metadatas", "distances"]
    )
    return [
        {"summary": doc, "relevance": round(1 - dist, 3), **meta}
        for doc, meta, dist in zip(
            res["documents"][0], res["metadatas"][0], res["distances"][0]
        )
    ]


def n_days_ago(n: int) -> str:
    return (datetime.today() - timedelta(days=n)).strftime("%Y-%m-%d")

def today() -> str:
    return datetime.today().strftime("%Y-%m-%d")

# ── PYDANTIC MODELS ───────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    collection: str = "sales"  # sales | day_book | ledgers | groups
    top_k: int = 5

class AskRequest(BaseModel):
    question: str  # raw voice/text from user e.g. "last 5 days sales"

# ═════════════════════════════════════════════════════════════════════════════
#  ROUTES
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/")
def health():
    """Health check — returns record count per collection."""
    counts = {}
    for name in ["groups", "ledgers", "stock_items", "day_book", "sales"]:
        try:
            counts[name] = chroma.get_collection(name).count()
        except Exception:
            counts[name] = 0
    return {"status": "ok", "collections": counts}


# ── SALES ─────────────────────────────────────────────────────────────────────

@app.get("/sales/recent")
def sales_recent(days: int = Query(default=5, ge=1, le=365, description="Last N days")):
    """
    Last N days of sales invoices.
    Frontend usage: GET /sales/recent?days=5
    """
    rows  = chroma_get("sales", where={
        "$and": [
            {"date": {"$gte": n_days_ago(days)}},
            {"date": {"$lte": today()}},
        ]
    })
    total = sum(r.get("amount", 0) for r in rows)
    return {
        "days": days,
        "from_date": n_days_ago(days),
        "to_date": today(),
        "invoice_count": len(rows),
        "total_amount": round(total, 2),
        "invoices": rows,
    }


@app.get("/sales/total")
def sales_total(days: int = Query(default=30, ge=1, le=365)):
    """
    Just the total ₹ figure — good for dashboard summary cards.
    Frontend usage: GET /sales/total?days=30
    """
    rows  = chroma_get("sales", where={
        "$and": [
            {"date": {"$gte": n_days_ago(days)}},
            {"date": {"$lte": today()}},
        ]
    })
    return {
        "days": days,
        "total_amount": round(sum(r.get("amount", 0) for r in rows), 2),
        "invoice_count": len(rows),
    }


@app.get("/sales/customer")
def sales_by_customer(name: str = Query(..., description="Customer name")):
    """
    All invoices for one customer.
    Frontend usage: GET /sales/customer?name=ABC Traders
    """
    rows  = chroma_get("sales", where={"customer": {"$eq": name}})
    total = sum(r.get("amount", 0) for r in rows)
    return {
        "customer": name,
        "invoice_count": len(rows),
        "total_amount": round(total, 2),
        "invoices": rows,
    }


@app.get("/sales/above")
def sales_above(amount: float = Query(..., description="Minimum invoice amount")):
    """
    Invoices above a certain amount.
    Frontend usage: GET /sales/above?amount=50000
    """
    rows = chroma_get("sales", where={"amount": {"$gte": amount}})
    return {
        "min_amount": amount,
        "invoice_count": len(rows),
        "invoices": rows,
    }


# ── LEDGERS ───────────────────────────────────────────────────────────────────

@app.get("/ledgers")
def list_ledgers(group: str = Query(default=None, description="Filter by group")):
    """
    All ledgers, optionally filtered by group.
    Frontend usage: GET /ledgers  or  GET /ledgers?group=Sundry+Debtors
    """
    where = {"group": {"$eq": group}} if group else None
    rows  = chroma_get("ledgers", where=where)
    return {"count": len(rows), "ledgers": rows}


# ── GROUPS ────────────────────────────────────────────────────────────────────

@app.get("/groups")
def list_groups():
    """GET /groups"""
    rows = chroma_get("groups")
    return {"count": len(rows), "groups": rows}


# ── SEMANTIC SEARCH ───────────────────────────────────────────────────────────

@app.post("/search")
def semantic_search(req: SearchRequest):
    """
    Vector similarity search on any collection.
    Good for: 'find large invoices', 'show debtors', etc.

    Frontend usage:
    POST /search
    { "query": "large invoice this month", "collection": "sales", "top_k": 5 }
    """
    rows = chroma_search(req.collection, req.query, req.top_k)
    return {
        "query": req.query,
        "collection": req.collection,
        "results": rows,
    }


# ── SMART ASK ─────────────────────────────────────────────────────────────────

@app.post("/ask")
def ask(req: AskRequest):
    """
    Send raw voice/text question → get structured answer back.
    This is the main endpoint for your voice assistant.

    Frontend usage:
    POST /ask
    { "question": "show me last 5 days sales" }

    Returns:
    {
      "intent": "sales_by_date",
      "answer": "Total sales in last 5 days is ₹45,000 across 3 invoices.",
      "data": [ ... ]
    }
    """
    q = req.question.lower().strip()

    # ── 1. Date-based sales ──────────────────────────────────────────────────
    date_phrases = [
        ("today",        1),  ("yesterday",    2),
        ("last 3 days",  3),  ("last 5 days",  5),
        ("last 7 days",  7),  ("last week",    7),
        ("last 15 days", 15), ("last month",   30),
        ("last 30 days", 30), ("this month",   30),
    ]
    for phrase, days in date_phrases:
        if phrase in q and "sale" in q:
            rows  = chroma_get("sales", where={
                "$and": [
                    {"date": {"$gte": n_days_ago(days)}},
                    {"date": {"$lte": today()}},
                ]
            })
            total = sum(r.get("amount", 0) for r in rows)
            return {
                "intent": "sales_by_date",
                "answer": f"Total sales in last {days} day(s) is ₹{total:,.2f} across {len(rows)} invoice(s).",
                "data": rows,
            }

    # ── 2. Sales above amount ────────────────────────────────────────────────
    amt_match = re.search(r"(?:above|more than|greater than|over)\s+(\d+)", q)
    if amt_match:
        amt  = float(amt_match.group(1))
        rows = chroma_get("sales", where={"amount": {"$gte": amt}})
        return {
            "intent": "sales_by_amount",
            "answer": f"Found {len(rows)} invoice(s) above ₹{amt:,.0f}.",
            "data": rows,
        }

    # ── 3. Specific customer ─────────────────────────────────────────────────
    if "customer" in q or "party" in q:
        rows = chroma_search("sales", req.question)
        return {
            "intent": "sales_by_customer",
            "answer": f"Top {len(rows)} matching sales record(s).",
            "data": rows,
        }

    # ── 4. Ledger lookup ─────────────────────────────────────────────────────
    if any(w in q for w in ["ledger", "account", "cash", "bank", "debtor", "creditor"]):
        rows = chroma_search("ledgers", req.question)
        return {
            "intent": "ledger_search",
            "answer": f"Found {len(rows)} matching ledger(s).",
            "data": rows,
        }

    # ── 5. Voucher type ──────────────────────────────────────────────────────
    for vtype in ["payment", "receipt", "purchase", "journal", "contra"]:
        if vtype in q:
            rows = chroma_get("day_book", where={"voucher_type": {"$eq": vtype.capitalize()}})
            return {
                "intent": "daybook_by_type",
                "answer": f"Found {len(rows)} {vtype} voucher(s).",
                "data": rows,
            }

    # ── 6. Fallback: semantic search on day_book ─────────────────────────────
    rows = chroma_search("day_book", req.question)
    return {
        "intent": "semantic_fallback",
        "answer": f"Top {len(rows)} matching result(s) for: '{req.question}'",
        "data": rows,
    }