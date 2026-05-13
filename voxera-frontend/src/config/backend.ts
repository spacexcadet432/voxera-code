/**
 * HTTP base for the Python FastAPI backend (verify routes, health).
 * WebSocket URL is derived by swapping http(s) → ws(s).
 */
export function getVoxeraBackendBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_VOXERA_BACKEND_URL as string | undefined;
  const trimmed = (fromEnv ?? "").trim().replace(/\/$/, "");
  if (trimmed) return trimmed;
  if (import.meta.env.DEV) return "http://127.0.0.1:8000";
  return "";
}

export function getVoxeraVoiceWebSocketUrl(): string {
  const base = getVoxeraBackendBaseUrl();
  if (!base) return "";
  const wsBase = base.replace(/^http/i, (m) => (m.toLowerCase() === "https" ? "wss" : "ws"));
  return `${wsBase}/ws/voice`;
}
