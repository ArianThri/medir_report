from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    secret_key: str = "change_this_secret_key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080
    database_url: str = "sqlite:///./medireport.db"
    static_base_url: str = "http://127.0.0.1:8000/static"

    @property
    def project_root(self) -> Path:
        return Path.cwd()

settings = Settings()
