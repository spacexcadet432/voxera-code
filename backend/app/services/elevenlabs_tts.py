from __future__ import annotations

import time

import httpx


async def synthesize_speech_mp3(
    *,
    api_key: str,
    voice_id: str,
    text: str,
) -> tuple[bytes, float]:
    """Return (mp3_bytes, latency_seconds)."""

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": api_key,
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
    }
    body = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.75},
    }

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=20.0)) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code == 401:
            raise RuntimeError("ElevenLabs authentication failed. Check your API key.")
        if resp.status_code >= 400:
            raise RuntimeError(
                f"ElevenLabs error {resp.status_code}: {resp.text[:500]}",
            )
        data = resp.content

    latency = time.monotonic() - t0
    return data, latency
