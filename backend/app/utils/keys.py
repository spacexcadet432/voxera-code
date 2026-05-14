from __future__ import annotations

from app.models.schemas import ApiKeysPayload
from app.state.settings import Settings


def effective_api_keys(client: ApiKeysPayload, settings: Settings) -> tuple[ApiKeysPayload | None, str | None]:
    """
    Resolve keys for a voice session.

    - If VOXERA_DISALLOW_CLIENT_KEYS is true, only server env keys are used (production).
    - Otherwise each provider uses the server env key when set, else the client-provided key.
    """
    if settings.voxera_disallow_client_keys:
        keys = ApiKeysPayload(
            openai=(settings.openai_api_key or "").strip(),
            deepgram=(settings.deepgram_api_key or "").strip(),
            elevenlabs=(settings.elevenlabs_api_key or "").strip(),
        )
        if not keys.openai or not keys.deepgram or not keys.elevenlabs:
            return None, (
                "VOXERA_DISALLOW_CLIENT_KEYS is enabled but one or more server keys are missing "
                "(OPENAI_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY)."
            )
        return keys, None

    merged = ApiKeysPayload(
        openai=(settings.openai_api_key or client.openai or "").strip(),
        deepgram=(settings.deepgram_api_key or client.deepgram or "").strip(),
        elevenlabs=(settings.elevenlabs_api_key or client.elevenlabs or "").strip(),
    )
    if not merged.openai or not merged.deepgram or not merged.elevenlabs:
        return None, (
            "Missing API keys: set them in the browser or configure OPENAI_API_KEY, "
            "DEEPGRAM_API_KEY, and ELEVENLABS_API_KEY on the server."
        )
    return merged, None


def resolve_verify_key(body_key: str, server_key: str, *, settings: Settings) -> str | None:
    """When VOXERA_DISALLOW_CLIENT_KEYS is true, ignore body keys (production hardening)."""

    if settings.voxera_disallow_client_keys:
        sk = (server_key or "").strip()
        return sk or None
    k = (body_key or "").strip()
    if k:
        return k
    sk = (server_key or "").strip()
    return sk or None
