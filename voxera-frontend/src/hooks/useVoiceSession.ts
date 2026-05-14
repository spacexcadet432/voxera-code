import { useCallback, useEffect, useRef, useState } from "react";
import { fetchVoiceCapabilities, getVoxeraVoiceWebSocketUrl } from "@/config/backend";
import { useVoxeraStore } from "@/store/voxeraStore";
import type { SessionStatus } from "@/store/voxeraStore";
import type { Turn } from "@/components/TranscriptPanel";

type ServerJson = {
  type: string;
  message?: string;
  text?: string;
  state?: string;
  id?: string;
  role?: string;
  pending?: boolean;
  stt?: number;
  llm?: number;
  tts?: number;
  total?: number;
  format?: string;
  base64?: string;
};

const TARGET_SAMPLE_RATE = 16000;

function floatToPcm16(input: Float32Array, inputRate: number): Int16Array {
  if (inputRate === TARGET_SAMPLE_RATE) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const idx = Math.min(input.length - 1, Math.floor(i * ratio));
    const s = Math.max(-1, Math.min(1, input[idx]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function mapOrbToStatus(state: string): SessionStatus {
  if (state === "idle" || state === "listening" || state === "thinking" || state === "speaking" || state === "processing") {
    return state;
  }
  return "listening";
}

/**
 * Voice session: streams PCM16 mono 16kHz to the FastAPI WebSocket backend.
 * The backend runs Deepgram → OpenAI → ElevenLabs and pushes UI + audio events.
 */
export function useVoiceSession() {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [supported, setSupported] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const ampRafRef = useRef<number>(0);
  const playAmpRafRef = useRef<number>(0);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const pingTimerRef = useRef<number>(0);
  const watchdogTimerRef = useRef<number>(0);
  const assistantStreamRef = useRef<{ id: string; text: string } | null>(null);
  /** True while `stop()` is tearing down the socket so `onclose` does not show a spurious error. */
  const userInitiatedStopRef = useRef(false);
  const stopRef = useRef<() => void>(() => {});
  const lastPongAtRef = useRef<number>(Date.now());

  const {
    setStatus,
    setActive,
    setMuted,
    setAmplitude,
    setInterim,
    setError,
    appendTurn,
    patchTurn,
    pushMetric,
    resetConversation,
  } = useVoxeraStore.getState();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok =
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      Boolean(window.WebSocket) &&
      Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    setSupported(ok);
  }, []);

  const stopAmpLoop = useCallback(() => {
    if (ampRafRef.current) {
      cancelAnimationFrame(ampRafRef.current);
      ampRafRef.current = 0;
    }
    if (playAmpRafRef.current) {
      cancelAnimationFrame(playAmpRafRef.current);
      playAmpRafRef.current = 0;
    }
    setAmplitude(0);
  }, [setAmplitude]);

  const startMicAmpLoop = useCallback(
    (node: AnalyserNode) => {
      const data = new Uint8Array(node.frequencyBinCount);
      const tick = () => {
        node.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setAmplitude(Math.min(1, rms * 3));
        ampRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    },
    [setAmplitude],
  );

  const startPlaybackAmpLoop = useCallback(
    (node: AnalyserNode) => {
      const data = new Uint8Array(node.frequencyBinCount);
      const tick = () => {
        node.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setAmplitude(Math.min(1, rms * 3));
        playAmpRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    },
    [setAmplitude],
  );

  const stopPlayback = useCallback(() => {
    try {
      playbackSourceRef.current?.stop();
    } catch {
      /* noop */
    }
    playbackSourceRef.current = null;
    if (playAmpRafRef.current) {
      cancelAnimationFrame(playAmpRafRef.current);
      playAmpRafRef.current = 0;
    }
  }, []);

  const playMp3FromBase64 = useCallback(
    async (b64: string) => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      stopPlayback();

      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

      let buffer: AudioBuffer;
      try {
        buffer = await ctx.decodeAudioData(copy);
      } catch (e) {
        console.error(e);
        useVoxeraStore.getState().setError("Could not decode AI audio for playback.");
        return;
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      an.connect(ctx.destination);
      playbackSourceRef.current = src;

      startPlaybackAmpLoop(an);

      src.onended = () => {
        if (playAmpRafRef.current) {
          cancelAnimationFrame(playAmpRafRef.current);
          playAmpRafRef.current = 0;
        }
        setAmplitude(0);
        playbackSourceRef.current = null;
      };

      try {
        src.start();
      } catch (e) {
        console.error(e);
        useVoxeraStore.getState().setError("Audio playback failed to start (try tapping Start again).");
      }
    },
    [setAmplitude, startPlaybackAmpLoop, stopPlayback],
  );

  const handleServerPayload = useCallback(
    (payload: ServerJson) => {
      switch (payload.type) {
        case "ready":
          setError(null);
          return;
        case "pong":
          return;
        case "error": {
          const msg = payload.message ?? "Unknown backend error";
          setError(msg);
          return;
        }
        case "interim": {
          setInterim(payload.text ?? "");
          return;
        }
        case "orb": {
          if (payload.state) setStatus(mapOrbToStatus(payload.state));
          return;
        }
        case "user_turn": {
          if (!payload.id || !payload.text) return;
          const exists = useVoxeraStore.getState().turns.some((t: Turn) => t.id === payload.id);
          if (!exists) {
            const turn: Turn = { id: payload.id, role: "user", text: payload.text };
            appendTurn(turn);
          }
          return;
        }
        case "assistant_turn": {
          if (!payload.id) return;
          const pending = Boolean(payload.pending);
          const text = payload.text ?? "";
          const turns = useVoxeraStore.getState().turns;
          const exists = turns.some((t: Turn) => t.id === payload.id);
          if (!exists) {
            appendTurn({ id: payload.id, role: "assistant", text, pending });
            assistantStreamRef.current = { id: payload.id, text };
            return;
          }
          patchTurn(payload.id, { text, pending });
          if (!pending) assistantStreamRef.current = null;
          return;
        }
        case "assistant_delta": {
          if (!payload.id || !payload.text) return;
          let cur = assistantStreamRef.current;
          if (!cur || cur.id !== payload.id) {
            cur = { id: payload.id, text: "" };
            assistantStreamRef.current = cur;
          }
          cur.text += payload.text;
          patchTurn(payload.id, { text: cur.text, pending: true });
          return;
        }
        case "metrics": {
          if (
            typeof payload.stt === "number" &&
            typeof payload.llm === "number" &&
            typeof payload.tts === "number" &&
            typeof payload.total === "number"
          ) {
            pushMetric({ stt: payload.stt, llm: payload.llm, tts: payload.tts, total: payload.total });
          }
          return;
        }
        case "audio": {
          if (payload.format === "mp3" && payload.base64) {
            void playMp3FromBase64(payload.base64);
          }
          return;
        }
        case "context_reset":
          return;
        default:
          return;
      }
    },
    [appendTurn, patchTurn, playMp3FromBase64, pushMetric, setError, setInterim, setStatus],
  );

  const wireWebSocket = useCallback(
    (ws: WebSocket) => {
      ws.binaryType = "arraybuffer";
      ws.onmessage = (ev) => {
        lastPongAtRef.current = Date.now();
        if (typeof ev.data === "string") {
          try {
            const payload = JSON.parse(ev.data) as ServerJson;
            handleServerPayload(payload);
          } catch {
            /* noop */
          }
        }
      };
      ws.onerror = () => {
        setError("WebSocket connection error.");
      };
      ws.onclose = () => {
        if (userInitiatedStopRef.current) {
          userInitiatedStopRef.current = false;
          return;
        }
        if (useVoxeraStore.getState().active) {
          setError("Disconnected from voice backend.");
          setActive(false);
          setStatus("idle");
        }
      };
    },
    [handleServerPayload, setActive, setError, setStatus],
  );

  const start = useCallback(async () => {
    setError(null);

    if (!supported) {
      setError("Voice session isn't supported in this browser. Try Chrome or Edge.");
      return;
    }

    const wsUrl = getVoxeraVoiceWebSocketUrl();
    if (!wsUrl) {
      setError("Backend URL is not configured. Set VITE_VOXERA_BACKEND_URL.");
      return;
    }

    const { apiKeys, aiSettings } = useVoxeraStore.getState();
    const caps = await fetchVoiceCapabilities();
    const serverReady = Boolean(caps?.serverKeysComplete);
    const clientReady =
      Boolean(apiKeys.openai.trim()) && Boolean(apiKeys.deepgram.trim()) && Boolean(apiKeys.elevenlabs.trim());
    if (!serverReady && !clientReady) {
      setError(
        "Add API keys in API Configuration, or configure OPENAI_API_KEY, DEEPGRAM_API_KEY, and ELEVENLABS_API_KEY on the server.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }

      const source = ctx.createMediaStreamSource(stream);
      micSourceRef.current = source;
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      source.connect(node);
      micAnalyserRef.current = node;
      setAnalyser(node);
      startMicAmpLoop(node);

      const bufferSize = 4096;
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      const silent = ctx.createGain();
      silent.gain.value = 0;
      processor.connect(silent);
      silent.connect(ctx.destination);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      await new Promise<void>((resolve, reject) => {
        const to = window.setTimeout(() => reject(new Error("WebSocket connect timeout")), 12000);
        const onOpen = () => {
          window.clearTimeout(to);
          cleanup();
          resolve();
        };
        const onErr = () => {
          window.clearTimeout(to);
          cleanup();
          reject(new Error("WebSocket failed to connect"));
        };
        const cleanup = () => {
          ws.removeEventListener("open", onOpen);
          ws.removeEventListener("error", onErr);
        };
        ws.addEventListener("open", onOpen, { once: true });
        ws.addEventListener("error", onErr, { once: true });
      });

      ws.send(
        JSON.stringify({
          type: "init",
          keys: {
            openai: apiKeys.openai.trim(),
            deepgram: apiKeys.deepgram.trim(),
            elevenlabs: apiKeys.elevenlabs.trim(),
          },
          aiSettings: {
            systemPrompt: aiSettings.systemPrompt,
            personality: aiSettings.personality,
            voice: aiSettings.voice,
            temperature: aiSettings.temperature,
          },
        }),
      );

      await new Promise<void>((resolve, reject) => {
        const to = window.setTimeout(() => reject(new Error("Backend init timeout")), 15000);
        const onMsg = (ev: MessageEvent) => {
          if (typeof ev.data !== "string") return;
          try {
            const payload = JSON.parse(ev.data) as ServerJson;
            if (payload.type === "ready") {
              window.clearTimeout(to);
              ws.removeEventListener("message", onMsg);
              resolve();
            } else if (payload.type === "error") {
              window.clearTimeout(to);
              ws.removeEventListener("message", onMsg);
              reject(new Error(payload.message ?? "Init failed"));
            }
          } catch {
            /* noop */
          }
        };
        ws.addEventListener("message", onMsg);
      });

      wireWebSocket(ws);
      lastPongAtRef.current = Date.now();

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = floatToPcm16(input, ctx.sampleRate);
        wsRef.current.send(pcm.buffer);
      };

      pingTimerRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000) as unknown as number;

      watchdogTimerRef.current = window.setInterval(() => {
        if (!useVoxeraStore.getState().active || ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastPongAtRef.current > 75000) {
          setError("Voice backend stopped responding. Tap Stop, then Start.");
          userInitiatedStopRef.current = true;
          stopRef.current();
        }
      }, 30000) as unknown as number;

      setActive(true);
      setStatus("listening");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not start voice session.");
      streamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      streamRef.current = null;
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
      processorRef.current = null;
      micSourceRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      setAnalyser(null);
      stopAmpLoop();
    }
  }, [
    supported,
    setError,
    setActive,
    setStatus,
    setAnalyser,
    startMicAmpLoop,
    stopAmpLoop,
    wireWebSocket,
  ]);

  const stop = useCallback(() => {
    userInitiatedStopRef.current = true;

    if (pingTimerRef.current) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = 0;
    }
    if (watchdogTimerRef.current) {
      window.clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = 0;
    }

    try {
      processorRef.current && (processorRef.current.onaudioprocess = null);
      processorRef.current?.disconnect();
    } catch {
      /* noop */
    }
    processorRef.current = null;

    try {
      micSourceRef.current?.disconnect();
    } catch {
      /* noop */
    }
    micSourceRef.current = null;

    stopPlayback();

    setAnalyser(null);
    stopAmpLoop();
    setInterim("");
    setActive(false);
    setStatus("idle");

    try {
      wsRef.current?.close();
    } catch {
      /* noop */
    }
    wsRef.current = null;

    streamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    streamRef.current = null;

    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    userInitiatedStopRef.current = false;
  }, [setActive, setAnalyser, setInterim, setStatus, stopAmpLoop, stopPlayback]);

  const toggleMute = useCallback(() => {
    const next = !useVoxeraStore.getState().muted;
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
  }, [setMuted]);

  const reset = useCallback(() => {
    resetConversation();
    assistantStreamRef.current = null;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "reset_context" }));
    }
  }, [resetConversation]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  useEffect(() => {
    return () => {
      userInitiatedStopRef.current = true;
      if (pingTimerRef.current) window.clearInterval(pingTimerRef.current);
      if (watchdogTimerRef.current) window.clearInterval(watchdogTimerRef.current);
      processorRef.current && (processorRef.current.onaudioprocess = null);
      try {
        processorRef.current?.disconnect();
      } catch {
        /* noop */
      }
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
      }
      streamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      stopAmpLoop();
    };
  }, [stopAmpLoop]);

  return {
    analyser,
    supported,
    start,
    stop,
    toggleMute,
    reset,
  };
}
