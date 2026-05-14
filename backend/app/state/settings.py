from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    voxera_host: str = "0.0.0.0"
    voxera_port: int = 8000
    voxera_cors_origins: str = ""
    """
    Comma-separated browser origins for CORS.
    Empty → the app uses `*` (simplest for localhost + same-network devices).
    """

    voxera_cors_origin_regex: str = ""
    """Optional single regex for extra allowed origins (advanced)."""

    voxera_disallow_client_keys: bool = False
    """
    When true, voice + verify use only server env keys (OPENAI_API_KEY, etc.).
    Client-supplied keys in init are ignored.
    """

    voxera_allowed_hosts: str = ""
    """Comma-separated hostnames for TrustedHostMiddleware. Empty = disabled (typical for local)."""

    voxera_log_level: str = "INFO"

    voxera_ws_idle_timeout_seconds: int = 0
    """
    Close the browser voice WebSocket if no message (text or binary) is received for this long.
    0 disables. Client ping interval should be shorter than this (e.g. 300 with 25s pings).
    """

    openai_model: str = "gpt-4o-mini"
    deepgram_model: str = "nova-2"
    elevenlabs_default_voice_id: str = "21m00Tcm4TlvDq8ikWAM"

    openai_api_key: str = Field(default="", repr=False)
    deepgram_api_key: str = Field(default="", repr=False)
    elevenlabs_api_key: str = Field(default="", repr=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
