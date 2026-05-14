from __future__ import annotations

from fastapi import APIRouter

from app.state.settings import get_settings

router = APIRouter(prefix="/api", tags=["public"])


@router.get("/voice-capabilities")
async def voice_capabilities() -> dict[str, object]:
    """Non-secret hints for the browser (used to decide whether client API keys are required)."""

    s = get_settings()
    o = bool((s.openai_api_key or "").strip())
    d = bool((s.deepgram_api_key or "").strip())
    e = bool((s.elevenlabs_api_key or "").strip())
    return {
        "disallowClientKeys": s.voxera_disallow_client_keys,
        "serverKeySlots": {"openai": o, "deepgram": d, "elevenlabs": e},
        "serverKeysComplete": o and d and e,
    }
