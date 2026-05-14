from __future__ import annotations

import json
import time
from collections.abc import Callable, Coroutine
from typing import Any

import httpx

from app.services.llm_types import LlmStreamResult


async def stream_openai_chat(
    *,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    system: str,
    temperature: float,
    on_delta: Callable[[str], Coroutine[Any, Any, None]] | None = None,
) -> LlmStreamResult:
    """Stream a chat completion; returns reply + wall ms + time-to-first-token (TTFT)."""

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "system", "content": system}, *messages],
        "temperature": temperature,
        "stream": True,
    }

    t_stream = time.monotonic()
    assembled: list[str] = []
    ttft_mono: float | None = None

    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=20.0)) as client:
        async with client.stream("POST", url, headers=headers, json=body) as resp:
            if resp.status_code == 429:
                raise RuntimeError("OpenAI rate limit (429). Please wait and try again.")
            if resp.status_code == 401:
                raise RuntimeError("OpenAI authentication failed. Check your API key.")
            if resp.status_code >= 400:
                text = await resp.aread()
                raise RuntimeError(f"OpenAI error {resp.status_code}: {text.decode(errors='replace')[:500]}")

            buf = ""
            async for chunk in resp.aiter_bytes():
                if not chunk:
                    continue
                buf += chunk.decode(errors="ignore")
                while True:
                    line_end = buf.find("\n")
                    if line_end < 0:
                        break
                    line = buf[:line_end].strip()
                    buf = buf[line_end + 1 :]
                    if not line or line.startswith(":"):
                        continue
                    if not line.startswith("data:"):
                        continue
                    payload = line.removeprefix("data:").strip()
                    if payload == "[DONE]":
                        buf = ""
                        break
                    try:
                        data = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    choices = data.get("choices") or []
                    if not choices:
                        continue
                    delta = (choices[0].get("delta") or {}).get("content")
                    if delta:
                        if ttft_mono is None:
                            ttft_mono = time.monotonic()
                        assembled.append(delta)
                        if on_delta is not None:
                            await on_delta(delta)

    t_end = time.monotonic()
    wall_ms = (t_end - t_stream) * 1000.0
    ttft_ms = (ttft_mono - t_stream) * 1000.0 if ttft_mono is not None else None
    reply = "".join(assembled).strip()
    return LlmStreamResult(reply=reply, wall_ms=wall_ms, ttft_ms=ttft_ms)
