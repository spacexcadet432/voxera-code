/**
 * HTTP base for the Python FastAPI backend (verify routes, health, capabilities).
 * WebSocket URL is derived by swapping http(s) → ws(s), unless overridden.
 */

const TRUEISH = new Set(["1", "true", "yes", "on"]);

export function serverKeysOnlyFromEnv(): boolean {
  const v = (import.meta.env.VITE_VOXERA_SERVER_KEYS as string | undefined)?.trim().toLowerCase();
  return v ? TRUEISH.has(v) : false;
}

/** Normalize backend URL for production (HTTPS page + HTTP API URL → upgrade to HTTPS). */
export function getVoxeraBackendBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_VOXERA_BACKEND_URL as string | undefined;
  let trimmed = (fromEnv ?? "").trim().replace(/\/$/, "");
  if (!trimmed) {
    if (import.meta.env.DEV) return "http://127.0.0.1:8000";
    return "";
  }

  if (typeof window !== "undefined" && import.meta.env.PROD) {
    if (window.location.protocol === "https:" && trimmed.startsWith("http://")) {
      try {
        const u = new URL(trimmed);
        trimmed = `https://${u.host}${u.pathname}`.replace(/\/$/, "");
      } catch {
        /* keep original */
      }
    }
  }
  return trimmed;
}

export function getVoxeraVoiceWebSocketUrl(): string {
  const wsOverride = (import.meta.env.VITE_VOXERA_WS_URL as string | undefined)?.trim();
  if (wsOverride) return wsOverride.replace(/\/$/, "");

  const base = getVoxeraBackendBaseUrl();
  if (!base) return "";
  const wsBase = base.replace(/^http/i, (m) => (m.toLowerCase() === "https" ? "wss" : "ws"));
  return `${wsBase}/ws/voice`;
}

export async function fetchVoiceCapabilities(): Promise<{
  disallowClientKeys: boolean;
  serverKeySlots: { openai: boolean; deepgram: boolean; elevenlabs: boolean };
  serverKeysComplete: boolean;
} | null> {
  const base = getVoxeraBackendBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/voice-capabilities`, { method: "GET" });
    if (!res.ok) return null;
    return (await res.json()) as {
      disallowClientKeys: boolean;
      serverKeySlots: { openai: boolean; deepgram: boolean; elevenlabs: boolean };
      serverKeysComplete: boolean;
    };
  } catch {
    return null;
  }
}
