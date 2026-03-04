import re


BUSINESS_KEYWORDS = {
    "customer": [
        "customer",
        "client",
        "party",
        "buyer"
    ],
    "product": [
        "product",
        "item",
        "stock",
        "goods"
    ],
    "payment": [
        "payment",
        "due",
        "outstanding",
        "pending"
    ],
    "purchase": [
        "purchase",
        "bought",
        "expense",
        "procurement"
    ]
}


def extract_business_entities(text: str) -> dict:
    """
    Extracts high-level business entities from user query.
    Returns flags / labels, not actual DB values.
    """

    entities = {}
    text = text.lower()

    for entity_type, keywords in BUSINESS_KEYWORDS.items():
        for keyword in keywords:
            if re.search(rf"\b{keyword}\b", text):
                entities[entity_type] = True
                break

    return entities
