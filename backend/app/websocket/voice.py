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
from app.telemetry.stats import latency_aggregate
from app.utils.keys import effective_api_keys

logger = logging.getLogger(__name__)

router = APIRouter()

_TELEMETRY_KEYS = (
    "stt_segment",
    "stt_pcm_to_partial",
    "llm_wall",
    "llm_ttft",
    "tts_wall",
    "tts_first_byte",
    "total",
)


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
    """
    One browser tab ↔ one WebSocket ↔ one Deepgram live session (when initialized).

    Pipeline stages (async, cancellable via `_pipeline_task`):
    1. STT final segment arrives (Deepgram) → `_kick_pipeline`
    2. Persist user turn → OpenAI stream (`stream_openai_chat`) → assistant text
    3. ElevenLabs stream (`synthesize_speech_mp3`) → base64 audio to client
    4. Emit `metrics` + structured `extra` (per-run + rolling p50/avg) + JSON log line
    """

    def __init__(self, websocket: WebSocket, settings: Settings) -> None:
        self.ws = websocket
        self.settings = settings
        self.session_id = str(uuid.uuid4())
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
        self._stt_pcm_to_partial_ms: float = 0.0
        self._last_client_pcm_mono = time.monotonic()
        self._last_rx_mono = time.monotonic()
        self._telemetry_runs: list[dict[str, float]] = []

    async def _rx_idle_watchdog(self) -> None:
        timeout = int(self.settings.voxera_ws_idle_timeout_seconds or 0)
        if timeout <= 0:
            return
        try:
            while self._alive.is_set():
                await asyncio.sleep(max(20.0, min(120.0, float(timeout) / 3.0)))
                if time.monotonic() - self._last_rx_mono > float(timeout):
                    logger.info(
                        "voice_ws_idle_close session_id=%s timeout_s=%s",
                        self.session_id,
                        timeout,
                    )
                    with contextlib.suppress(Exception):
                        await self.ws.close(code=1001)
                    return
        except asyncio.CancelledError:
            raise

    async def _send(self, event: ServerEvent) -> None:
        await self.ws.send_text(event.model_dump_json(exclude_none=True))

    async def _emit_orb(self, state: str) -> None:
        await self._send(ServerEvent(type="orb", state=state))

    async def _handle_dg_event(self, msg: dict[str, Any]) -> None:
        if msg.get("type") == "Error":
            err = msg.get("description") or msg.get("message") or "Deepgram error"
            logger.warning("deepgram_error session_id=%s msg=%s", self.session_id, err)
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
                t = time.monotonic()
                self._stt_first_interim_mono = t
                self._stt_pcm_to_partial_ms = max(0.0, (t - self._last_client_pcm_mono) * 1000.0)
            await self._send(ServerEvent(type="interim", text=transcript))
            await self._emit_orb("listening")
            return

        stt_segment_ms = 0.0
        if self._stt_first_interim_mono is not None:
            stt_segment_ms = max(0.0, (time.monotonic() - self._stt_first_interim_mono) * 1000.0)
        pcm_to_partial = self._stt_pcm_to_partial_ms
        self._stt_first_interim_mono = None
        self._stt_pcm_to_partial_ms = 0.0

        await self._send(ServerEvent(type="interim", text=""))
        await self._emit_orb("processing")
        asyncio.create_task(
            self._kick_pipeline(
                transcript,
                stt_segment_ms=stt_segment_ms,
                stt_pcm_to_partial_ms=pcm_to_partial,
            ),
        )

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
                logger.info("deepgram_connected session_id=%s", self.session_id)
                while self._alive.is_set():
                    msg = await self._dg_queue.get()
                    if msg.get("type") == "_dg_closed":
                        logger.warning("deepgram_socket_closed session_id=%s reconnecting", self.session_id)
                        break
                    await self._handle_dg_event(msg)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.exception("deepgram_supervisor_error session_id=%s", self.session_id)
                await self._send(ServerEvent(type="error", message=f"Deepgram session error: {exc}"))
            finally:
                if self._dg is not None:
                    await self._dg.close()
                    self._dg = None

            if not self._alive.is_set():
                break
            await asyncio.sleep(backoff)

    async def _kick_pipeline(
        self,
        user_text: str,
        *,
        stt_segment_ms: float,
        stt_pcm_to_partial_ms: float,
    ) -> None:
        if self._pipeline_task and not self._pipeline_task.done():
            self._pipeline_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._pipeline_task
        self._pipeline_task = asyncio.create_task(
            self._pipeline_turn(
                user_text,
                stt_segment_ms=stt_segment_ms,
                stt_pcm_to_partial_ms=stt_pcm_to_partial_ms,
            ),
            name=f"voxera-pipeline-{self.session_id[:8]}",
        )

    async def _pipeline_turn(
        self,
        user_text: str,
        *,
        stt_segment_ms: float,
        stt_pcm_to_partial_ms: float,
    ) -> None:
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

        # --- Stage: LLM (streaming, TTFT measured inside service) ---
        try:
            llm_out = await stream_openai_chat(
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
            logger.exception("llm_stage_failed session_id=%s", self.session_id)
            await self._send(ServerEvent(type="error", message=str(exc)))
            await self._send(
                ServerEvent(type="assistant_turn", id=assistant_id, role="assistant", text="", pending=False),
            )
            await self._emit_orb("listening")
            return

        reply = llm_out.reply.strip() or "(no response)"
        llm_wall_ms = llm_out.wall_ms
        llm_ttft_ms = llm_out.ttft_ms

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

        # --- Stage: TTS (streamed download, TTFB measured) ---
        try:
            tts_out = await synthesize_speech_mp3(
                api_key=self.keys.elevenlabs,
                voice_id=voice_id,
                text=reply,
            )
        except asyncio.CancelledError:
            await self._emit_orb("listening")
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("tts_stage_failed session_id=%s", self.session_id)
            await self._send(ServerEvent(type="error", message=str(exc)))
            await self._emit_orb("listening")
            return

        tts_wall_ms = tts_out.wall_ms
        tts_first_byte_ms = tts_out.first_byte_ms
        total_ms = (time.monotonic() - t_pipeline0) * 1000.0

        run: dict[str, float] = {
            "stt_segment": stt_segment_ms,
            "stt_pcm_to_partial": stt_pcm_to_partial_ms,
            "llm_wall": llm_wall_ms,
            "llm_ttft": float(llm_ttft_ms) if llm_ttft_ms is not None else 0.0,
            "tts_wall": tts_wall_ms,
            "tts_first_byte": float(tts_first_byte_ms) if tts_first_byte_ms is not None else 0.0,
            "total": total_ms,
        }
        self._telemetry_runs.append(run)
        self._telemetry_runs = self._telemetry_runs[-20:]
        aggregate = latency_aggregate(self._telemetry_runs, _TELEMETRY_KEYS)

        log_line = {
            "event": "pipeline_turn",
            "session_id": self.session_id,
            "user_chars": len(user_text),
            "reply_chars": len(reply),
            "run_ms": run,
            "rolling": aggregate,
        }
        logger.info("%s", json.dumps(log_line, default=str))

        b64 = base64.b64encode(tts_out.mp3).decode("ascii")
        await self._send(ServerEvent(type="audio", format="mp3", base64=b64))

        extra: dict[str, Any] = {
            "run": {
                "sttSegmentMs": stt_segment_ms,
                "sttPcmToFirstPartialMs": stt_pcm_to_partial_ms,
                "llmWallMs": llm_wall_ms,
                "llmTtftMs": llm_ttft_ms,
                "ttsWallMs": tts_wall_ms,
                "ttsFirstByteMs": tts_first_byte_ms,
                "totalMs": total_ms,
            },
            "aggregate": {k: (v if isinstance(v, int) else round(float(v), 2)) for k, v in aggregate.items()},
        }

        await self._send(
            ServerEvent(
                type="metrics",
                stt=stt_segment_ms,
                llm=llm_wall_ms,
                tts=tts_wall_ms,
                total=total_ms,
                extra=extra,
            ),
        )
        await self._emit_orb("listening")

    async def handle_init(self, keys: ApiKeysPayload, ai: AiSettingsPayload) -> None:
        merged, err = effective_api_keys(keys, self.settings)
        if err or merged is None:
            await self._send(ServerEvent(type="error", message=err or "API keys are not configured."))
            return

        if self._supervisor_task is not None and not self._supervisor_task.done():
            self._supervisor_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._supervisor_task
            self._supervisor_task = None

        self.keys = merged
        self.ai = ai
        self._initialized = True
        self._alive.set()
        self._telemetry_runs.clear()

        self._supervisor_task = asyncio.create_task(
            self._deepgram_supervisor(),
            name=f"voxera-dg-{self.session_id[:8]}",
        )

        logger.info("voice_session_initialized session_id=%s", self.session_id)
        await self._send(ServerEvent(type="ready"))

    async def handle_binary_pcm(self, data: bytes) -> None:
        if data:
            self._last_client_pcm_mono = time.monotonic()
        if not self._initialized or self._dg is None:
            return
        await self._dg.send_pcm(data)

    async def run(self) -> None:
        logger.info("voice_session_begin session_id=%s", self.session_id)
        self._last_rx_mono = time.monotonic()
        watchdog: asyncio.Task[None] | None = None
        if self.settings.voxera_ws_idle_timeout_seconds > 0:
            watchdog = asyncio.create_task(self._rx_idle_watchdog())
        try:
            while True:
                message = await self.ws.receive()
                self._last_rx_mono = time.monotonic()
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
                        logger.warning("invalid_control session_id=%s err=%s", self.session_id, exc)
                        await self._send(
                            ServerEvent(type="error", message=f"Invalid control message: {exc}"),
                        )
                        continue

                    if ctrl.type == "ping":
                        await self._send(ServerEvent(type="pong"))
                        continue

                    if ctrl.type == "reset_context":
                        self.history = []
                        self._telemetry_runs.clear()
                        logger.info("voice_context_reset session_id=%s", self.session_id)
                        await self._send(ServerEvent(type="context_reset"))
                        continue

                    if ctrl.type == "init":
                        if ctrl.aiSettings is None:
                            await self._send(
                                ServerEvent(type="error", message="init requires aiSettings."),
                            )
                            continue
                        keys_payload = ctrl.keys if ctrl.keys is not None else ApiKeysPayload()
                        await self.handle_init(keys_payload, ctrl.aiSettings)
        except WebSocketDisconnect:
            logger.info("voice_ws_disconnect session_id=%s", self.session_id)
        finally:
            if watchdog is not None:
                watchdog.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await watchdog
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
            logger.info("voice_session_end session_id=%s", self.session_id)


@router.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket) -> None:
    settings = get_settings()
    await websocket.accept()
    peer = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    session = VoiceConnection(websocket, settings)
    logger.info("voice_ws_accepted session_id=%s peer=%s", session.session_id, peer)
    await session.run()
