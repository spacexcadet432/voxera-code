from __future__ import annotations

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/verify", tags=["verify"])


class KeyBody(BaseModel):
    apiKey: str = Field(min_length=1, max_length=8192)


@router.post("/openai")
async def verify_openai(body: KeyBody) -> dict[str, bool | str]:
    headers = {"Authorization": f"Bearer {body.apiKey}"}
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
    headers = {"Authorization": f"Token {body.apiKey}"}
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
    headers = {"xi-api-key": body.apiKey}
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
