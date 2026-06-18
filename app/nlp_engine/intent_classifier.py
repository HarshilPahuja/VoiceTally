import re
from app.core import constants

INTENT_PATTERNS = {
    # 1. Ledger Balance (checked first to prevent general sales/purchase keywords from overriding)
    constants.GET_LEDGER_BALANCE: [
        r"\bledgers?\b",
        r"\bbalances?\b of\b",
        r"\baccount balances?\b",
        r"\bbalances?\b"
    ],
    # 2. Outstanding Payments
    constants.GET_OUTSTANDING_PAYMENTS: [
        r"\boutstandings?\b",
        r"\bpending payments?\b",
        r"\bnot paid\b",
        r"\bdue amounts?\b"
    ],
    # 3. Low Stock Items
    constants.GET_LOW_STOCK_ITEMS: [
        r"\blow stocks?\b",
        r"\brunning low\b",
        r"\bstocks? remaining\b"
    ],
    # 4. Daily Business Summary
    constants.GET_DAILY_BUSINESS_SUMMARY: [
        r"\btoday.*summar(y|ies)\b",
        r"\bbusiness today\b",
        r"\btoday.*reports?\b"
    ],
    # 5. Stock/Inventory Inquiry
    constants.GET_STOCK_SUMMARY: [
        r"\bstocks? inquir(y|ies)\b",
        r"\binventor(y|ies)\b",
        r"\bstocks? levels?\b",
        r"\bhow many.*left\b",
        r"\bdo we have.*in stocks?\b"
    ],
    # 6. Purchase/Expense Overview
    constants.GET_PURCHASE_OVERVIEW: [
        r"\bpurchases?\b",
        r"\bexpenses?\b",
        r"\bbought\b"
    ],
    # 7. Sales Summary (checked last)
    constants.GET_SALES_SUMMARY: [
        r"\bsales?\b",
        r"\brevenues?\b",
        r"\bsales?\b"
    ],
}

def classify_intent_rules(text: str) -> tuple[str | None, float]:
    """
    Classifies intent using rule-based regex patterns.
    Returns: (intent, match_quality)
    """
    text = text.lower()

    for intent, patterns in INTENT_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text):
                # We return a match quality based on the complexity/length of the matched pattern
                # Exact matches or longer patterns represent higher match quality
                return intent, 1.0

    return None, 0.0
