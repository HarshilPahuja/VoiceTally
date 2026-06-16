from app.shared.llm_client import LLMClient
from app.shared.prompt_templates.summary_prompts import BUSINESS_SUMMARY_PROMPT


def generate_llm_summary(insights: dict) -> str:
    """
    Generates a summary using an LLM.
    This is a fallback and is not active until LLM is configured.
    """

    llm = LLMClient()

    if not llm.is_configured():
        raise RuntimeError("LLM is not configured")

    prompt = BUSINESS_SUMMARY_PROMPT.format(data=insights)
    return llm.generate(prompt)
