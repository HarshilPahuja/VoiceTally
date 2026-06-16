from app.nlp_engine.intent_classifier.rule_based import classify_intent
from app.nlp_engine.intent_classifier.llm_based import classify_intent_with_llm


def get_intent(text: str) -> str | None:
    """
    Determines intent using rule-based logic first,
    then LLM fallback if necessary.
    """

    intent = classify_intent(text)

    if intent:
        return intent

    # Fallback to LLM (if implemented & configured)
    try:
        return classify_intent_with_llm(text)
    except Exception:
        return None
