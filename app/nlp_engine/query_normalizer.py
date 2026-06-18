import re

def normalize_query(text: str) -> str:
    """
    Normalizes user input for NLP processing.
    - lowercases
    - removes extra spaces
    - standardizes common business phrases and Hinglish
    """
    text = text.lower()
    text = re.sub(r"\s+", " ", text).strip()

    # Common phrase and Hinglish normalization
    replacements = {
        "pichhle hafte": "last week",
        "is hafte": "this week",
        "aaj": "today",
        "kal": "yesterday",
        "sales amount": "sales",
        "total revenue": "sales",
        "ka balance": " balance of",
        "ki balance": " balance of",
        "dikhao": "show",
        "batao": "show",
        "baki": "outstanding",
        "dhandha": "summary",
    }

    for k, v in replacements.items():
        text = text.replace(k, v)

    return text
