import type { ConnectionTester, ConnectionTestResult } from "./types";
import { getVoxeraBackendBaseUrl } from "@/config/backend";

function shapeCheck(prefix: string | RegExp, key: string, label: string): ConnectionTestResult | null {
  if (!key.trim()) return { ok: false, error: `${label} key is empty` };
  if (typeof prefix === "string" && !key.startsWith(prefix)) {
    return { ok: false, error: `Expected ${label} key to start with "${prefix}"` };
  }
  if (prefix instanceof RegExp && !prefix.test(key)) {
    return { ok: false, error: `${label} key format looks invalid` };
  }
  return null;
}

async function postVerify(path: string, apiKey: string): Promise<ConnectionTestResult> {
  const base = getVoxeraBackendBaseUrl();
  if (!base) {
    return {
      ok: false,
      error: "Backend URL missing. Set VITE_VOXERA_BACKEND_URL (dev defaults to http://127.0.0.1:8000).",
    };
  }

  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `Request failed (${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { ok: false, error: msg };
  }
}

export const connectionTester: ConnectionTester = {
  async testOpenAI(key: string) {
    const bad = shapeCheck("sk-", key, "OpenAI");
    if (bad) return bad;
    return postVerify("/api/verify/openai", key);
  },
  async testDeepgram(key: string) {
    const bad = shapeCheck(/^[a-f0-9]{20,}$/i, key, "Deepgram");
    if (bad) return bad;
    return postVerify("/api/verify/deepgram", key);
  },
  async testElevenLabs(key: string) {
    const bad = shapeCheck(/^[a-zA-Z0-9_-]{20,}$/, key, "ElevenLabs");
    if (bad) return bad;
    return postVerify("/api/verify/elevenlabs", key);
  },
};
