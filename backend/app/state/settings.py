from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    voxera_host: str = "0.0.0.0"
    voxera_port: int = 8000
    voxera_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    openai_model: str = "gpt-4o-mini"
    deepgram_model: str = "nova-2"
    elevenlabs_default_voice_id: str = "21m00Tcm4TlvDq8ikWAM"


@lru_cache
def get_settings() -> Settings:
    return Settings()
