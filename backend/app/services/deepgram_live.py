from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import urllib.parse
from typing import Any

import websockets
from websockets.client import WebSocketClientProtocol

logger = logging.getLogger(__name__)


def build_deepgram_listen_uri(*, model: str) -> str:
    q = {
        "model": model,
        "language": "en",
        "smart_format": "true",
        "interim_results": "true",
        "endpointing": "450",
        "encoding": "linear16",
        "sample_rate": "16000",
        "channels": "1",
    }
    return "wss://api.deepgram.com/v1/listen?" + urllib.parse.urlencode(q)


class DeepgramLiveSession:
    """Minimal Deepgram live client: send PCM16 mono 16kHz, parse transcript JSON."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        on_message: asyncio.Queue[dict[str, Any]],
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._out_queue = on_message
        self._ws: WebSocketClientProtocol | None = None
        self._reader_task: asyncio.Task[None] | None = None

    async def connect(self) -> None:
        uri = build_deepgram_listen_uri(model=self._model)
        self._ws = await websockets.connect(
            uri,
            additional_headers=[("Authorization", f"Token {self._api_key}")],
            max_size=None,
            ping_interval=20,
            ping_timeout=20,
        )

        async def _read_loop() -> None:
            assert self._ws is not None
            try:
                async for raw in self._ws:
                    if isinstance(raw, bytes):
                        continue
                    try:
                        payload = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    await self._out_queue.put(payload)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning("Deepgram reader stopped: %s", exc)
            finally:
                await self._out_queue.put({"type": "_dg_closed"})

        self._reader_task = asyncio.create_task(_read_loop())

    async def send_pcm(self, data: bytes) -> None:
        if self._ws is None:
            return
        await self._ws.send(data)

    async def close(self) -> None:
        if self._reader_task is not None:
            self._reader_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reader_task
            self._reader_task = None
        if self._ws is not None:
            await self._ws.close()
            self._ws = None
