import re


# ── Name-extraction patterns ─────────────────────────────────────────────────
#
# The flow:  raw query -> normalize_text() (lowercases) -> extract_entities()
# So all patterns match lowercase text (re.IGNORECASE is used as belt-and-suspenders).
#
# Capture group stops at common stop-words to avoid eating too much text.

# Words that terminate a name capture
_STOP_WORDS = (
    r"from|to|in|on|for|of|today|yesterday|last|this|ledger|stock|item|"
    r"sales|purchase|payment|report|summary|balance|account|customer|client|"
    r"party|buyer|product|goods|inquiry|transactions|pending|outstanding|due|"
    r"left|remaining|level|overview"
)

# A single name-word (no stop-word)
_NAMEW = rf"(?!(?:{_STOP_WORDS})\b)[a-z][a-z0-9]*"

# A name: 1 required word + up to 4 more (each also not a stop-word)
_NAME = rf"{_NAMEW}(?:\s+{_NAMEW}){{0,4}}"


ENTITY_PATTERNS = {
    # customer_name  ────────────────────────────────────────────────────────
    "customer_name": [
        # "sales for abc traders", "invoice for xyz ltd", "payment for abc"
        rf"(?:sales|invoice|payment|outstanding|due)\s+for\s+({_NAME})",
        # "for customer abc traders", "for party xyz"
        rf"for\s+(?:customer|client|party|buyer)\s+({_NAME})",
        # "sales of abc traders"
        rf"(?:sales|invoice)\s+of\s+({_NAME})",
    ],

    # ledger_name  ──────────────────────────────────────────────────────────
    "ledger_name": [
        # "balance of sundry debtors", "balance of cash"
        rf"balance\s+of\s+({_NAME})",
        # "account balance for cash"
        rf"account\s+balance\s+for\s+({_NAME})",
        # "ledger cash", "account cash", "ledger for cash"
        rf"(?:ledger|account)\s+(?:for\s+)?({_NAME})",
        # "transactions for cash"
        rf"(?:transactions|entries)\s+for\s+({_NAME})",
    ],

    # item_name  ─────────────────────────────────────────────────────────────
    "item_name": [
        # "stock inquiry for cement bags", "inventory of cement", "item cement bags"
        rf"(?:stock\s+inquiry|stock\s+level|inventory|item|product|goods)\s+(?:for\s+|of\s+)?({_NAME})",
        # "how many cement left", "how many cement bags left"
        rf"how\s+many\s+({_NAME})(?:\s+(?:left|remaining|in\s+stock))?",
        # "do we have cement in stock"
        rf"do\s+we\s+have\s+({_NAME})(?:\s+in\s+stock)?",
    ],
}


def extract_business_entities(text: str) -> dict:
    """
    Extracts named business entity values from a (normalized/lowercased) user query.

    Returns a dict that may contain:
        customer_name  -> str, e.g. "abc traders"
        ledger_name    -> str, e.g. "cash"
        item_name      -> str, e.g. "cement bags"

    Input `text` is expected to already be lowercased (from normalize_text()).
    """
    entities = {}

    for entity_type, patterns in ENTITY_PATTERNS.items():
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                value = match.group(1).strip()
                if value:
                    entities[entity_type] = value
                    break  # use first matching pattern per entity type

    return entities
