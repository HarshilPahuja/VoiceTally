from fastapi import APIRouter
from app.shared.schemas import NLPRequest, NLPResponse
from app.nlp_engine.query_builder import build_structured_query
import httpx

router = APIRouter(prefix="/nlp", tags=["NLP"])


@router.post("/parse-query", response_model=NLPResponse)
async def parse_query(payload: NLPRequest):
    """
    Parses user query (text) and returns structured intent and entities.
    """
    result = build_structured_query(payload.query)
    return result


@router.post("/ask", response_model=NLPResponse)
async def ask_query(payload: NLPRequest):
    """
    Parses user query, asks ChromaDB for real Tally data, and returns a human-readable answer.
    """
    result = build_structured_query(payload.query)
    intent = result.get("intent")
    entities = result.get("entities", {})
    
    search_payload = {
        "query": payload.query,
        "top_k": 5
    }
    
    if intent == "GET_SALES_SUMMARY":
        search_payload["collection"] = "sales"
        date_range = entities.get("date_range", {})
        if "start" in date_range:
            search_payload["from_date"] = date_range["start"][:10]
        if "end" in date_range:
            search_payload["to_date"] = date_range["end"][:10]
            
    elif intent == "GET_LEDGER_BALANCE":
        search_payload["collection"] = "day_book"
        if "ledger_name" in entities:
             search_payload["query"] = f"{entities['ledger_name']} transactions"
             
    elif intent == "GET_STOCK_SUMMARY":
        search_payload["collection"] = "stock_items"
        if "item_name" in entities:
             search_payload["query"] = entities["item_name"]
             
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post("http://127.0.0.1:8000/search", json=search_payload, timeout=10.0)
            resp.raise_for_status()
            search_results = resp.json().get("results", [])
    except Exception as e:
        result["answer"] = f"Could not connect to Tally Data service (port 8000). Is it running? Error: {e}"
        return result
        
    if not search_results:
        result["answer"] = "I couldn't find any matching records in Tally."
        return result
        
    if intent == "GET_SALES_SUMMARY":
        total = sum(float(r.get("amount", 0)) for r in search_results)
        count = len(search_results)
        result["answer"] = f"Found {count} sales transactions. Total sales amount is ₹{total:,.2f}."
        
    elif intent == "GET_LEDGER_BALANCE":
        docs = [r.get("summary", "") for r in search_results[:3]]
        result["answer"] = "Here are the most relevant ledger transactions:\n• " + "\n• ".join(docs)
        
    elif intent == "GET_STOCK_SUMMARY":
        docs = [r.get("summary", "") for r in search_results[:3]]
        result["answer"] = "Here are the matching stock items:\n• " + "\n• ".join(docs)
        
    else:
        docs = [r.get("summary", "") for r in search_results[:3]]
        result["answer"] = "I found these relevant records:\n• " + "\n• ".join(docs)
        
    return result
