from app.shared.llm_client import LLMClient
from app.shared.prompt_templates.intent_prompts import INTENT_CLASSIFICATION_PROMPT


def classify_intent_with_llm(text: str) -> str | None:
    """
    Uses LLM to classify intent.
    """

    llm = LLMClient()

    if not llm.is_configured():
        raise RuntimeError("LLM not configured")

    prompt = INTENT_CLASSIFICATION_PROMPT.format(query=text)
    response = llm.generate(prompt)

    response = response.strip().upper()

    if response == "UNKNOWN":
        return None

    return response
