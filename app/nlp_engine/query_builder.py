from app.nlp_engine.intent_classifier.classifier import get_intent
from app.nlp_engine.entity_extraction.extractor import extract_entities
from app.nlp_engine.language_detection.detector import detect_language
from app.nlp_engine.normalizer import normalize_text


def build_structured_query(text: str) -> dict:
    language = detect_language(text)
    normalized_text = normalize_text(text)

    intent = get_intent(normalized_text)
    entities = extract_entities(normalized_text)

    if not intent:
        return {
            "intent": None,
            "entities": {},
            "language": language,
            "original_query": text,
            "error": "Unable to determine intent"
        }

    return {
        "intent": intent,
        "entities": entities,
        "language": language,
        "original_query": text
    }
