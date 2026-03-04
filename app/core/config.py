from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "VoiceTally Intelligence Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    OPENAI_API_KEY: str | None = None
    STT_PROVIDER: str = "whisper"

    class Config:
        env_file = ".env"


settings = Settings()
