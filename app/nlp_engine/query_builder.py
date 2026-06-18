from app.nlp_engine.language_detection.detector import detect_language
from app.nlp_engine.nlp_pipeline import process_query


def build_structured_query(text: str) -> dict:
    language = detect_language(text)
    
    # Process query through the hybrid rules + LLM fallback pipeline
    pipeline_res = process_query(text)
    
    intent = pipeline_res.get("intent")
    entities = pipeline_res.get("entities", {})
    confidence = pipeline_res.get("confidence", 0.0)
    source = pipeline_res.get("source", "unknown")
    warning = pipeline_res.get("warning")

    result = {
        "intent": intent,
        "entities": entities,
        "language": language,
        "original_query": text,
        "confidence": confidence,
        "source": source
    }
    
    if warning:
        result["warning"] = warning

    if not intent:
        result["error"] = "Unable to determine intent"

    return result
