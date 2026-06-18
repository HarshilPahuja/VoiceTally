import json
import httpx
from app.core.config import settings
from app.core import constants

SYSTEM_PROMPT = f"""You are a precise accounting extraction assistant for VoiceTally.
Your sole job is to convert a user's natural language accounting query into structured JSON.
Do NOT reply with any conversational text or explanations. Return ONLY valid JSON.

Supported Intents:
- "{constants.GET_SALES_SUMMARY}": For queries requesting total sales, sales volume, sales invoices, or sales revenue.
- "{constants.GET_OUTSTANDING_PAYMENTS}": For outstanding payments, unpaid bills, money due, or pending receipts.
- "{constants.GET_LOW_STOCK_ITEMS}": For items running low or below reorder levels.
- "{constants.GET_DAILY_BUSINESS_SUMMARY}": For overview summaries of today's business activity.
- "{constants.GET_STOCK_SUMMARY}": For stock level, inventory counts, or item availability queries.
- "{constants.GET_PURCHASE_OVERVIEW}": For expense reports, purchases, or vendor spending.
- "{constants.GET_LEDGER_BALANCE}": For specific ledger balances or account transactions.

Supported Entities in JSON:
- "customer_name": Name of customer or client.
- "ledger_name": Name of ledger (e.g., cash, sales ledger, sundry debtors).
- "item_name": Name of inventory item (e.g., cement, steel).
- "min_amount": Minimum monetary filter (number).
- "max_amount": Maximum monetary filter (number).
- "date_range": Dict containing "start" and "end" in YYYY-MM-DD format.

Example:
User: "Show me invoices above 50,000 for ABC Ltd generated last week"
Response JSON:
{{
  "intent": "{constants.GET_SALES_SUMMARY}",
  "entities": {{
    "customer_name": "ABC Ltd",
    "min_amount": 50000.0,
    "date_range": {{
      "start": "2026-06-11",
      "end": "2026-06-18"
    }}
  }}
}}
"""

def extract_with_llm(query: str) -> dict:
    """
    Calls OpenAI Chat Completion API to extract intent and entities.
    Returns: dict matching rule-based pipeline output.
    """
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        return {"error": "LLM fallback triggered but OPENAI_API_KEY is not configured."}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": query}
        ],
        "temperature": 0.0,
        "response_format": {"type": "json_object"}
    }

    try:
        # Use a synchronous HTTP post for the fallback pipeline
        with httpx.Client() as client:
            resp = client.post("https://api.openai.com/v1/chat/completions", json=payload, headers=headers, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()

        raw_content = data["choices"][0]["message"]["content"]
        extracted = json.loads(raw_content)

        # Ensure schema structure exists
        intent = extracted.get("intent")
        entities = extracted.get("entities", {})

        # Validation: Verify intent is supported
        valid_intents = [
            constants.GET_SALES_SUMMARY,
            constants.GET_OUTSTANDING_PAYMENTS,
            constants.GET_LOW_STOCK_ITEMS,
            constants.GET_DAILY_BUSINESS_SUMMARY,
            constants.GET_STOCK_SUMMARY,
            constants.GET_PURCHASE_OVERVIEW,
            constants.GET_LEDGER_BALANCE
        ]

        if intent not in valid_intents:
            intent = None

        return {
            "intent": intent,
            "entities": entities,
            "confidence": 0.95,  # High confidence set for successful LLM processing
            "source": "llm"
        }

    except Exception as e:
        return {"error": f"LLM fallback extraction failed: {str(e)}"}
