import re
from app.core import constants


INTENT_PATTERNS = {
    constants.GET_SALES_SUMMARY: [
        r"sales",
        r"revenue",
        r"total sales"
    ],
    constants.GET_OUTSTANDING_PAYMENTS: [
        r"outstanding",
        r"pending payment",
        r"not paid",
        r"due amount"
    ],
    constants.GET_LOW_STOCK_ITEMS: [
        r"low stock",
        r"running low",
        r"stock remaining"
    ],
    constants.GET_DAILY_BUSINESS_SUMMARY: [
        r"today.*summary",
        r"business today",
        r"today.*report"
    ],
    constants.GET_PURCHASE_OVERVIEW: [
        r"purchase",
        r"expenses",
        r"bought"
    ],
}


def classify_intent(text: str) -> str | None:
    text = text.lower()

    for intent, patterns in INTENT_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text):
                return intent

    return None
