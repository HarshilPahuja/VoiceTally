import re
from app.core import constants

def calculate_confidence(intent: str | None, entities: dict, text: str) -> float:
    """
    Computes a confidence score between 0.0 and 1.0.
    """
    if not intent:
        return 0.0

    score = 0.8  # Start with standard local rule match confidence

    # 1. Entity completeness bonus/penalty
    if intent == constants.GET_SALES_SUMMARY:
        # Sales summaries are enhanced with customer name or date range
        if "customer_name" in entities:
            score += 0.1
        if "date_range" in entities:
            score += 0.1

    elif intent == constants.GET_LEDGER_BALANCE:
        # Ledgers require a specific ledger or party name
        if "ledger_name" in entities or "customer_name" in entities:
            score += 0.2
        else:
            score -= 0.25  # Severe penalty if we don't know which ledger they want

    elif intent == constants.GET_STOCK_SUMMARY or intent == constants.GET_LOW_STOCK_ITEMS:
        # Stock items need specific item names
        if "item_name" in entities:
            score += 0.1

    # 2. Ambiguity check
    # Check if multiple conflicting concepts are present in the same query
    conflicts = 0
    if re.search(r"\bsales?\b", text) and re.search(r"\bpurchase\b", text):
        conflicts += 1
    if re.search(r"\boutstanding\b", text) and re.search(r"\bbought\b", text):
        conflicts += 1

    if conflicts > 0:
        score -= (conflicts * 0.3)

    return max(0.0, min(1.0, round(score, 2)))
