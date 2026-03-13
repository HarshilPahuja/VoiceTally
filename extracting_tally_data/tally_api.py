"""
tally_api.py — FastAPI server with a single global semantic search endpoint.
Run: uvicorn tally_api:app --reload --port 8000

Frontend sends any natural-language query → API searches all ChromaDB
collections by vector similarity → returns the best matches.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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
    allow_origins=["*"],   # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── REQUEST MODEL ────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str          # natural language text from frontend / voice
    top_k: int = 10     # max results to return

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
    Single global endpoint — searches ALL collections by vector similarity
    and returns the top matches ranked by relevance.

    Frontend usage:
        POST /search
        { "query": "show me last 5 days sales", "top_k": 10 }

    Returns:
        {
          "query": "...",
          "results": [
            { "collection": "sales", "summary": "...", "relevance": 0.87, ... },
            ...
          ]
        }
    """
    all_results = []

    for name in COLLECTION_NAMES:
        try:
            collection = chroma.get_collection(name)
        except Exception:
            continue  # collection doesn't exist yet, skip

        count = collection.count()
        if count == 0:
            continue

        n = min(req.top_k, count)

        res = collection.query(
            query_texts=[req.query],
            n_results=n,
            include=["documents", "metadatas", "distances"],
        )

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