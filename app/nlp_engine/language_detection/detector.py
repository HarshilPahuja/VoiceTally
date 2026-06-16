from langdetect import detect, LangDetectException


def detect_language(text: str) -> str:
    """
    Detect language of input text.
    Returns: 'en', 'hi', or 'unknown'
    """
    try:
        lang = detect(text)
        if lang in ["en", "hi"]:
            return lang
        return "unknown"
    except LangDetectException:
        return "unknown"
