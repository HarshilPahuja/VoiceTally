from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "VoiceTally Intelligence Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    OPENAI_API_KEY: str | None = None
    STT_PROVIDER: str = "whisper"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
