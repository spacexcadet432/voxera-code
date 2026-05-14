from __future__ import annotations

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.state.settings import get_settings
from app.utils.keys import resolve_verify_key

router = APIRouter(prefix="/api/verify", tags=["verify"])


class KeyBody(BaseModel):
    apiKey: str = Field(default="", max_length=8192)


@router.post("/openai")
async def verify_openai(body: KeyBody) -> dict[str, bool | str]:
    settings = get_settings()
    key = resolve_verify_key(body.apiKey, settings.openai_api_key, settings=settings)
    if not key:
        return {"ok": False, "error": "No OpenAI key provided and OPENAI_API_KEY is not set on the server."}

    headers = {"Authorization": f"Bearer {key}"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as client:
            resp = await client.get("https://api.openai.com/v1/models", headers=headers)
    except httpx.RequestError as exc:
        return {"ok": False, "error": f"Network error: {exc}"}

    if resp.status_code == 401:
        return {"ok": False, "error": "Invalid OpenAI API key."}
    if resp.status_code == 429:
        return {"ok": False, "error": "OpenAI rate limited this key (429)."}
    if resp.status_code >= 400:
        return {"ok": False, "error": f"OpenAI returned {resp.status_code}."}
    return {"ok": True}


@router.post("/deepgram")
async def verify_deepgram(body: KeyBody) -> dict[str, bool | str]:
    settings = get_settings()
    key = resolve_verify_key(body.apiKey, settings.deepgram_api_key, settings=settings)
    if not key:
        return {"ok": False, "error": "No Deepgram key provided and DEEPGRAM_API_KEY is not set on the server."}

    headers = {"Authorization": f"Token {key}"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as client:
            resp = await client.get("https://api.deepgram.com/v1/projects", headers=headers)
    except httpx.RequestError as exc:
        return {"ok": False, "error": f"Network error: {exc}"}

    if resp.status_code == 401 or resp.status_code == 403:
        return {"ok": False, "error": "Invalid Deepgram API key."}
    if resp.status_code >= 400:
        return {"ok": False, "error": f"Deepgram returned {resp.status_code}."}
    return {"ok": True}


@router.post("/elevenlabs")
async def verify_elevenlabs(body: KeyBody) -> dict[str, bool | str]:
    settings = get_settings()
    key = resolve_verify_key(body.apiKey, settings.elevenlabs_api_key, settings=settings)
    if not key:
        return {"ok": False, "error": "No ElevenLabs key provided and ELEVENLABS_API_KEY is not set on the server."}

    headers = {"xi-api-key": key}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as client:
            resp = await client.get("https://api.elevenlabs.io/v1/user", headers=headers)
    except httpx.RequestError as exc:
        return {"ok": False, "error": f"Network error: {exc}"}

    if resp.status_code == 401:
        return {"ok": False, "error": "Invalid ElevenLabs API key."}
    if resp.status_code >= 400:
        return {"ok": False, "error": f"ElevenLabs returned {resp.status_code}."}
    return {"ok": True}
