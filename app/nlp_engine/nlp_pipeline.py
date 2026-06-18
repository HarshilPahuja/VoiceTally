from app.nlp_engine.query_normalizer import normalize_query
from app.nlp_engine.intent_classifier import classify_intent_rules
from app.nlp_engine.entity_extractor import extract_entities_rules
from app.nlp_engine.confidence_scorer import calculate_confidence
from app.nlp_engine.llm_fallback import extract_with_llm

CONFIDENCE_THRESHOLD = 0.75

def process_query(text: str) -> dict:
    """
    Main entry point for the hybrid NLP extraction pipeline.
    Runs rule-based extraction, checks confidence, and falls back to LLM if needed.
    """
    # 1. Normalize
    normalized = normalize_query(text)

    # 2. Extract locally using rules
    intent, intent_quality = classify_intent_rules(normalized)
    entities = extract_entities_rules(normalized)

    # 3. Calculate confidence
    confidence = calculate_confidence(intent, entities, normalized)

    # Check if we should use local results
    if intent and confidence >= CONFIDENCE_THRESHOLD:
        return {
            "intent": intent,
            "entities": entities,
            "confidence": confidence,
            "source": "rules"
        }

    # 4. Fallback to LLM if confidence is low
    llm_result = extract_with_llm(text)
    if "error" in llm_result:
        # Fallback failed (e.g. no API key), return local best effort even if low confidence
        return {
            "intent": intent,
            "entities": entities,
            "confidence": confidence,
            "source": "rules_fallback_failed",
            "warning": llm_result["error"]
        }

    return llm_result
