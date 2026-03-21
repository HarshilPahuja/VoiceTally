from fastapi import APIRouter
from app.shared.schemas import NLPRequest, NLPResponse
from app.nlp_engine.query_builder import build_structured_query
import httpx

router = APIRouter(prefix="/nlp", tags=["NLP"])

# URL of the extracting_tally_data API
TALLY_DATA_URL = "http://127.0.0.1:8000/search"


@router.post("/parse-query", response_model=NLPResponse)
async def parse_query(payload: NLPRequest):
    """
    Parses user query (text) and returns structured intent and entities.
    Does NOT call ChromaDB — pure NLP only.
    """
    result = build_structured_query(payload.query)
    return result


@router.post("/ask", response_model=NLPResponse)
async def ask_query(payload: NLPRequest):
    """
    Full pipeline:
      1. Classify intent + extract entities from user query
      2. Build a structured search payload for the Tally Data API (port 8000)
      3. Post to /search, retrieve relevant ChromaDB records
      4. Compute a human-readable answer and return it

    Flow: TDL extension → POST /nlp/ask → POST :8000/search → ChromaDB
    """
    result = build_structured_query(payload.query)
    intent = result.get("intent")
    entities = result.get("entities", {})

    # ── Build search payload ────────────────────────────────────────────────
    search_payload: dict = {
        "query": payload.query,
        "top_k": 10,        # default; overridden per intent below
    }

    # ── Apply date range from entities (works for all intents) ─────────────
    date_range = entities.get("date_range", {})
    if "start" in date_range:
        search_payload["from_date"] = str(date_range["start"])[:10]
    if "end" in date_range:
        search_payload["to_date"] = str(date_range["end"])[:10]

    # ── Intent-specific collection + filters ────────────────────────────────
    if intent == "GET_SALES_SUMMARY":
        search_payload["collection"] = "sales"
        # Fetch up to 200 records so the aggregate SUM is correct
        search_payload["top_k"] = 200
        # If user named a customer, pass it as a filter
        customer_name = entities.get("customer_name")
        if customer_name:
            search_payload["customer"] = customer_name

    elif intent == "GET_LEDGER_BALANCE":
        search_payload["collection"] = "day_book"
        ledger_name = entities.get("ledger_name") or entities.get("customer_name")
        if ledger_name:
            # Use the ledger name as query text so vector search finds right entries
            search_payload["query"] = f"{ledger_name} transactions"
        search_payload["top_k"] = 50

    elif intent == "GET_STOCK_SUMMARY":
        search_payload["collection"] = "stock_items"
        item_name = entities.get("item_name")
        if item_name:
            search_payload["query"] = item_name
        search_payload["top_k"] = 20

    elif intent == "GET_OUTSTANDING_PAYMENTS":
        # Outstanding = day_book entries of type Receipt/Payment with party filters
        search_payload["collection"] = "day_book"
        search_payload["query"] = "outstanding pending payment receivable payable"
        search_payload["top_k"] = 100

    elif intent == "GET_PURCHASE_OVERVIEW":
        search_payload["collection"] = "day_book"
        search_payload["query"] = "purchase voucher expense bought"
        search_payload["voucher_type"] = "Purchase"
        search_payload["top_k"] = 100

    elif intent == "GET_DAILY_BUSINESS_SUMMARY":
        # No collection filter — search all collections for today's activity
        search_payload["query"] = "voucher today daily summary"
        search_payload["top_k"] = 50

    elif intent == "GET_LOW_STOCK_ITEMS":
        search_payload["collection"] = "stock_items"
        search_payload["query"] = "low stock remaining inventory"
        search_payload["top_k"] = 50

    # ── Call Tally Data API ─────────────────────────────────────────────────
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(TALLY_DATA_URL, json=search_payload, timeout=15.0)
            resp.raise_for_status()
            search_results = resp.json().get("results", [])
    except Exception as e:
        result["answer"] = (
            f"Could not connect to Tally Data service (port 8000). "
            f"Is it running? Error: {e}"
        )
        return result

    if not search_results:
        result["answer"] = "I couldn't find any matching records in Tally for your query."
        return result

    # ── Generate human-readable answer per intent ───────────────────────────

    if intent == "GET_SALES_SUMMARY":
        total = sum(float(r.get("amount", 0)) for r in search_results)
        count = len(search_results)
        customer_name = entities.get("customer_name")
        if customer_name:
            result["answer"] = (
                f"Found {count} sales transaction(s) for {customer_name.title()}. "
                f"Total sales amount: ₹{total:,.2f}."
            )
        else:
            result["answer"] = (
                f"Found {count} sales transaction(s). "
                f"Total sales amount: ₹{total:,.2f}."
            )

    elif intent == "GET_LEDGER_BALANCE":
        docs = [r.get("summary", "") for r in search_results[:5]]
        ledger_name = entities.get("ledger_name") or entities.get("customer_name", "the ledger")
        result["answer"] = (
            f"Here are the most relevant transactions for '{ledger_name.title()}':\n• "
            + "\n• ".join(docs)
        )

    elif intent == "GET_STOCK_SUMMARY":
        docs = [r.get("summary", "") for r in search_results[:5]]
        item_name = entities.get("item_name", "stock items")
        result["answer"] = (
            f"Here are matching stock entries for '{item_name}':\n• "
            + "\n• ".join(docs)
        )

    elif intent == "GET_OUTSTANDING_PAYMENTS":
        total = sum(float(r.get("amount", 0)) for r in search_results)
        count = len(search_results)
        result["answer"] = (
            f"Found {count} outstanding/pending transaction(s). "
            f"Total amount involved: ₹{total:,.2f}."
        )

    elif intent == "GET_PURCHASE_OVERVIEW":
        total = sum(abs(float(r.get("amount", 0))) for r in search_results)
        count = len(search_results)
        result["answer"] = (
            f"Found {count} purchase/expense transaction(s). "
            f"Total purchase amount: ₹{total:,.2f}."
        )

    elif intent == "GET_DAILY_BUSINESS_SUMMARY":
        docs = [r.get("summary", "") for r in search_results[:5]]
        result["answer"] = (
            f"Here is today's business activity summary ({len(search_results)} entries found):\n• "
            + "\n• ".join(docs)
        )

    elif intent == "GET_LOW_STOCK_ITEMS":
        docs = [r.get("summary", "") for r in search_results[:10]]
        result["answer"] = (
            f"Found {len(search_results)} stock item entries. Low stock items:\n• "
            + "\n• ".join(docs)
        )

    else:
        # Fallback for any unrecognized intent
        docs = [r.get("summary", "") for r in search_results[:5]]
        result["answer"] = (
            f"I found {len(search_results)} relevant records:\n• "
            + "\n• ".join(docs)
        )

    return result
