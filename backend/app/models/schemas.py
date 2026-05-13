from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ApiKeysPayload(BaseModel):
    openai: str = Field(default="", max_length=4096)
    deepgram: str = Field(default="", max_length=4096)
    elevenlabs: str = Field(default="", max_length=4096)


class AiSettingsPayload(BaseModel):
    systemPrompt: str = Field(default="", max_length=8000)
    personality: str = Field(default="", max_length=500)
    voice: str = Field(default="auto", max_length=256)
    temperature: float = Field(default=0.8, ge=0, le=2)


class ClientControlMessage(BaseModel):
    type: Literal["init", "ping", "reset_context"]

    keys: ApiKeysPayload | None = None
    aiSettings: AiSettingsPayload | None = None


class ServerEvent(BaseModel):
    """JSON events sent to the browser over the voice WebSocket."""

    type: Literal[
        "ready",
        "error",
        "pong",
        "interim",
        "orb",
        "user_turn",
        "assistant_turn",
        "assistant_delta",
        "metrics",
        "audio",
        "context_reset",
    ]
    message: str | None = None
    text: str | None = None
    state: str | None = None
    id: str | None = None
    role: str | None = None
    stt: float | None = None
    llm: float | None = None
    tts: float | None = None
    total: float | None = None
    format: str | None = None
    base64: str | None = None
    pending: bool | None = None
    extra: dict[str, Any] | None = None
