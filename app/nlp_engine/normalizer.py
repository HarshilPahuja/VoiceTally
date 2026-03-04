import re


def normalize_text(text: str) -> str:
    """
    Normalizes user input for NLP processing.
    - lowercases
    - removes extra spaces
    - standardizes common business phrases
    """
    text = text.lower()
    text = re.sub(r"\s+", " ", text).strip()

    # Common phrase normalization
    replacements = {
        "pichhle hafte": "last week",
        "is hafte": "this week",
        "aaj": "today",
        "kal": "yesterday",
        "sales amount": "sales",
        "total revenue": "sales",
    }

    for k, v in replacements.items():
        text = text.replace(k, v)

    return text
