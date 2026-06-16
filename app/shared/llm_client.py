from app.core.config import settings


class LLMClient:
    """
    Centralized LLM interface.
    Actual API calls will be implemented later.
    """

    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY

    def is_configured(self) -> bool:
        return self.api_key is not None

    def generate(self, prompt: str) -> str:
        """
        Placeholder for LLM text generation.
        """
        raise NotImplementedError(
            "LLM integration not implemented yet"
        )
