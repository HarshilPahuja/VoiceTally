import re
from datetime import date, timedelta
from app.nlp_engine.entity_extraction.date_parser import extract_date_range
from app.nlp_engine.entity_extraction.business_entities import extract_business_entities

def extract_entities_rules(text: str) -> dict:
    """
    Extracts date range, business entities, and numeric limits using rule-based patterns.
    """
    text = text.lower()
    entities = {}

    # 1. Date range extraction
    start, end = extract_date_range(text)
    if start and end:
        entities["date_range"] = {
            "start": str(start),
            "end": str(end)
        }

    # 2. Business entities (customer_name, ledger_name, item_name)
    bus_entities = extract_business_entities(text)
    if bus_entities:
        entities.update(bus_entities)

    # 3. Numeric limits (min_amount, max_amount)
    above_match = re.search(r"(?:above|over|greater\s+than|more\s+than|\bgte\b)\s+(\d+)", text)
    if above_match:
        entities["min_amount"] = float(above_match.group(1))

    below_match = re.search(r"(?:below|under|less\s+than|\blte\b)\s+(\d+)", text)
    if below_match:
        entities["max_amount"] = float(below_match.group(1))

    return entities
