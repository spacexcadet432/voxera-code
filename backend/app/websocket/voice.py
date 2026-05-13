from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models.schemas import AiSettingsPayload, ApiKeysPayload, ClientControlMessage, ServerEvent
from app.services.deepgram_live import DeepgramLiveSession
from app.services.elevenlabs_tts import synthesize_speech_mp3
from app.services.openai_chat import stream_openai_chat
from app.state.settings import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_voice_id(ai: AiSettingsPayload, default_id: str) -> str:
    v = (ai.voice or "").strip()
    if not v or v.lower() == "auto":
        return default_id
    if len(v) >= 8 and all(c.isalnum() or c in "_-" for c in v):
        return v
    return default_id


def _build_system_prompt(ai: AiSettingsPayload) -> str:
    base = (
        ai.systemPrompt.strip()
        or "You are Voxera, a calm, intelligent realtime voice AI. Reply in 1-3 short conversational sentences suitable for being spoken aloud. Avoid markdown."
    )
    personality = ai.personality.strip()
    if personality:
        return f"{base}\n\nPersonality: {personality}."
    return base


def _trim_history(history: list[dict[str, str]], max_items: int = 24) -> list[dict[str, str]]:
    if len(history) <= max_items:
        return history
    return history[-max_items:]


class VoiceConnection:
    def __init__(self, websocket: WebSocket, settings: Settings) -> None:
        self.ws = websocket
        self.settings = settings
        self.keys: ApiKeysPayload | None = None
        self.ai: AiSettingsPayload | None = None
        self.history: list[dict[str, str]] = []
        self._dg_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._dg: DeepgramLiveSession | None = None
        self._supervisor_task: asyncio.Task[None] | None = None
        self._pipeline_task: asyncio.Task[None] | None = None
        self._alive = asyncio.Event()
        self._initialized = False
        self._stt_first_interim_mono: float | None = None

    async def _send(self, event: ServerEvent) -> None:
        await self.ws.send_text(event.model_dump_json(exclude_none=True))

    async def _emit_orb(self, state: str) -> None:
        await self._send(ServerEvent(type="orb", state=state))

    async def _handle_dg_event(self, msg: dict[str, Any]) -> None:
        if msg.get("type") == "Error":
            err = msg.get("description") or msg.get("message") or "Deepgram error"
            await self._send(ServerEvent(type="error", message=str(err)))
            return

        if msg.get("type") != "Results":
            return

        channel = msg.get("channel") or {}
        alts = channel.get("alternatives") or []
        if not alts:
            return
        transcript = (alts[0].get("transcript") or "").strip()
        is_final = bool(msg.get("is_final"))

        if not transcript:
            return

        if not is_final:
            if self._stt_first_interim_mono is None:
                self._stt_first_interim_mono = time.monotonic()
            await self._send(ServerEvent(type="interim", text=transcript))
            await self._emit_orb("listening")
            return

        # Final segment
        stt_ms = 0.0
        if self._stt_first_interim_mono is not None:
            stt_ms = max(0.0, (time.monotonic() - self._stt_first_interim_mono) * 1000.0)
        self._stt_first_interim_mono = None

        await self._send(ServerEvent(type="interim", text=""))
        await self._emit_orb("processing")
        asyncio.create_task(self._kick_pipeline(transcript, stt_ms=stt_ms))

    async def _deepgram_supervisor(self) -> None:
        backoff = 0.6
        while self._alive.is_set():
            if not self._initialized or self.keys is None:
                await asyncio.sleep(0.05)
                continue
            try:
                self._dg = DeepgramLiveSession(
                    api_key=self.keys.deepgram,
                    model=self.settings.deepgram_model,
                    on_message=self._dg_queue,
                )
                await self._dg.connect()
                while self._alive.is_set():
                    msg = await self._dg_queue.get()
                    if msg.get("type") == "_dg_closed":
                        logger.warning("Deepgram socket closed; reconnecting soon")
                        break
                    await self._handle_dg_event(msg)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                await self._send(ServerEvent(type="error", message=f"Deepgram session error: {exc}"))
            finally:
                if self._dg is not None:
                    await self._dg.close()
                    self._dg = None

            if not self._alive.is_set():
                break
            await asyncio.sleep(backoff)

    async def _kick_pipeline(self, user_text: str, *, stt_ms: float) -> None:
        if self._pipeline_task and not self._pipeline_task.done():
            self._pipeline_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._pipeline_task
        self._pipeline_task = asyncio.create_task(self._pipeline(user_text, stt_ms=stt_ms))

    async def _pipeline(self, user_text: str, *, stt_ms: float) -> None:
        assert self.keys is not None
        assert self.ai is not None

        t_pipeline0 = time.monotonic()

        user_id = str(uuid.uuid4())
        await self._send(ServerEvent(type="user_turn", id=user_id, role="user", text=user_text))
        self.history.append({"role": "user", "content": user_text})
        self.history = _trim_history(self.history)

        await self._emit_orb("thinking")

        assistant_id = str(uuid.uuid4())
        await self._send(
            ServerEvent(type="assistant_turn", id=assistant_id, role="assistant", text="", pending=True),
        )

        system = _build_system_prompt(self.ai)

        async def on_delta(delta: str) -> None:
            await self._send(ServerEvent(type="assistant_delta", id=assistant_id, text=delta))

        try:
            reply, llm_sec = await stream_openai_chat(
                api_key=self.keys.openai,
                model=self.settings.openai_model,
                messages=self.history,
                system=system,
                temperature=float(self.ai.temperature),
                on_delta=on_delta,
            )
        except asyncio.CancelledError:
            await self._send(
                ServerEvent(type="assistant_turn", id=assistant_id, role="assistant", text="", pending=False),
            )
            await self._emit_orb("listening")
            raise
        except Exception as exc:  # noqa: BLE001
            await self._send(ServerEvent(type="error", message=str(exc)))
            await self._send(
                ServerEvent(type="assistant_turn", id=assistant_id, role="assistant", text="", pending=False),
            )
            await self._emit_orb("listening")
            return

        reply = reply.strip() or "(no response)"
        llm_ms = llm_sec * 1000.0

        self.history.append({"role": "assistant", "content": reply})
        self.history = _trim_history(self.history)

        await self._send(
            ServerEvent(
                type="assistant_turn",
                id=assistant_id,
                role="assistant",
                text=reply,
                pending=False,
            ),
        )

        await self._emit_orb("speaking")

        voice_id = _resolve_voice_id(self.ai, self.settings.elevenlabs_default_voice_id)
        try:
            mp3, tts_sec = await synthesize_speech_mp3(
                api_key=self.keys.elevenlabs,
                voice_id=voice_id,
                text=reply,
            )
        except asyncio.CancelledError:
            await self._emit_orb("listening")
            raise
        except Exception as exc:  # noqa: BLE001
            await self._send(ServerEvent(type="error", message=str(exc)))
            await self._emit_orb("listening")
            return

        tts_ms = tts_sec * 1000.0
        total_ms = (time.monotonic() - t_pipeline0) * 1000.0

        b64 = base64.b64encode(mp3).decode("ascii")
        await self._send(ServerEvent(type="audio", format="mp3", base64=b64))
        await self._send(
            ServerEvent(type="metrics", stt=stt_ms, llm=llm_ms, tts=tts_ms, total=total_ms),
        )
        await self._emit_orb("listening")

    async def handle_init(self, keys: ApiKeysPayload, ai: AiSettingsPayload) -> None:
        if not keys.openai.strip() or not keys.deepgram.strip() or not keys.elevenlabs.strip():
            await self._send(ServerEvent(type="error", message="All three API keys are required."))
            return

        if self._supervisor_task is not None and not self._supervisor_task.done():
            self._supervisor_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._supervisor_task
            self._supervisor_task = None

        self.keys = keys
        self.ai = ai
        self._initialized = True
        self._alive.set()

        self._supervisor_task = asyncio.create_task(self._deepgram_supervisor())

        await self._send(ServerEvent(type="ready"))

    async def handle_binary_pcm(self, data: bytes) -> None:
        if not self._initialized or self._dg is None:
            return
        await self._dg.send_pcm(data)

    async def run(self) -> None:
        try:
            while True:
                message = await self.ws.receive()
                mtype = message.get("type")
                if mtype == "websocket.disconnect":
                    break

                if "bytes" in message and message["bytes"] is not None:
                    await self.handle_binary_pcm(message["bytes"])
                    continue

                if "text" in message and message["text"] is not None:
                    try:
                        raw = json.loads(message["text"])
                        ctrl = ClientControlMessage.model_validate(raw)
                    except Exception as exc:  # noqa: BLE001
                        await self._send(
                            ServerEvent(type="error", message=f"Invalid control message: {exc}"),
                        )
                        continue

                    if ctrl.type == "ping":
                        await self._send(ServerEvent(type="pong"))
                        continue

                    if ctrl.type == "reset_context":
                        self.history = []
                        await self._send(ServerEvent(type="context_reset"))
                        continue

                    if ctrl.type == "init":
                        if ctrl.keys is None or ctrl.aiSettings is None:
                            await self._send(
                                ServerEvent(type="error", message="init requires keys and aiSettings."),
                            )
                            continue
                        await self.handle_init(ctrl.keys, ctrl.aiSettings)
        except WebSocketDisconnect:
            pass
        finally:
            self._alive.clear()
            if self._pipeline_task and not self._pipeline_task.done():
                self._pipeline_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await self._pipeline_task
            if self._supervisor_task is not None:
                self._supervisor_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await self._supervisor_task
            if self._dg is not None:
                await self._dg.close()


@router.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket) -> None:
    settings = get_settings()
    await websocket.accept()
    session = VoiceConnection(websocket, settings)
    await session.run()
