from app.nlp_engine.entity_extraction.date_parser import extract_date_range
from app.nlp_engine.entity_extraction.business_entities import extract_business_entities


def extract_entities(text: str) -> dict:
    entities = {}

    # Date entities
    start, end = extract_date_range(text)
    if start and end:
        entities["date_range"] = {
            "start": str(start),
            "end": str(end)
        }

    # Business entities
    business_entities = extract_business_entities(text)
    if business_entities:
        entities.update(business_entities)

    return entities
