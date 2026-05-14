from __future__ import annotations

import time
from dataclasses import dataclass

import httpx


@dataclass(frozen=True, slots=True)
class TtsStreamResult:
    mp3: bytes
    wall_ms: float
    """Wall ms from request start until full body received."""
    first_byte_ms: float | None
    """Ms from request start until first response byte (TTFB / audio onset from network)."""


async def synthesize_speech_mp3(
    *,
    api_key: str,
    voice_id: str,
    text: str,
) -> TtsStreamResult:
    """Stream-download MP3; measures wall time and time-to-first-byte."""

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
    first_byte_mono: float | None = None
    chunks: list[bytes] = []

    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=20.0)) as client:
        async with client.stream("POST", url, headers=headers, json=body) as resp:
            if resp.status_code == 401:
                raise RuntimeError("ElevenLabs authentication failed. Check your API key.")
            if resp.status_code >= 400:
                err = await resp.aread()
                raise RuntimeError(
                    f"ElevenLabs error {resp.status_code}: {err.decode(errors='replace')[:500]}",
                )
            async for part in resp.aiter_bytes():
                if not part:
                    continue
                if first_byte_mono is None:
                    first_byte_mono = time.monotonic()
                chunks.append(part)

    t1 = time.monotonic()
    data = b"".join(chunks)
    wall_ms = (t1 - t0) * 1000.0
    first_byte_ms = (first_byte_mono - t0) * 1000.0 if first_byte_mono is not None else None
    return TtsStreamResult(mp3=data, wall_ms=wall_ms, first_byte_ms=first_byte_ms)
