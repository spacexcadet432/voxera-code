import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { OrbState } from "@/components/Orb";
import type { Turn } from "@/components/TranscriptPanel";
import type { Metrics } from "@/components/PipelineMetrics";

export type SessionStatus = OrbState | "processing";

export type ConnectionStatus = "unknown" | "testing" | "connected" | "error";

export interface ApiKeys {
  openai: string;
  deepgram: string;
  elevenlabs: string;
}

export interface AiSettings {
  systemPrompt: string;
  personality: string;
  voice: string;
  temperature: number;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  systemPrompt:
    "You are Voxera, a calm, intelligent realtime voice AI. Reply in 1-3 short conversational sentences suitable for being spoken aloud. Avoid markdown.",
  personality: "Calm, precise, slightly futuristic",
  voice: "auto",
  temperature: 0.8,
};

interface PersistedSlice {
  apiKeys: ApiKeys;
  aiSettings: AiSettings;
  setApiKey: (provider: keyof ApiKeys, value: string) => void;
  setApiKeys: (next: ApiKeys) => void;
  setAiSettings: (next: AiSettings) => void;
}

interface RuntimeSlice {
  status: SessionStatus;
  active: boolean;
  muted: boolean;
  amplitude: number;
  turns: Turn[];
  interim: string;
  metrics: Metrics;
  error: string | null;
  connection: Record<keyof ApiKeys, ConnectionStatus>;
  setStatus: (s: SessionStatus) => void;
  setActive: (a: boolean) => void;
  setMuted: (m: boolean) => void;
  setAmplitude: (n: number) => void;
  setInterim: (t: string) => void;
  setError: (e: string | null) => void;
  setConnection: (provider: keyof ApiKeys, status: ConnectionStatus) => void;
  appendTurn: (turn: Turn) => void;
  patchTurn: (id: string, patch: Partial<Turn>) => void;
  resetConversation: () => void;
  pushMetric: (entry: Omit<Metrics, "history"> & { lastTelemetry?: Metrics["lastTelemetry"] }) => void;
}

export type VoxeraStore = PersistedSlice & RuntimeSlice;

export const useVoxeraStore = create<VoxeraStore>()(
  persist(
    (set) => ({
      // persisted
      apiKeys: { openai: "", deepgram: "", elevenlabs: "" },
      aiSettings: DEFAULT_AI_SETTINGS,
      setApiKey: (provider, value) =>
        set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: value } })),
      setApiKeys: (next) => set({ apiKeys: next }),
      setAiSettings: (next) => set({ aiSettings: next }),

      // runtime
      status: "idle",
      active: false,
      muted: false,
      amplitude: 0,
      turns: [],
      interim: "",
      metrics: { stt: 0, llm: 0, tts: 0, total: 0, history: [] },
      error: null,
      connection: { openai: "unknown", deepgram: "unknown", elevenlabs: "unknown" },
      setStatus: (status) => set({ status }),
      setActive: (active) => set({ active }),
      setMuted: (muted) => set({ muted }),
      setAmplitude: (amplitude) => set({ amplitude }),
      setInterim: (interim) => set({ interim }),
      setError: (error) => set({ error }),
      setConnection: (provider, status) =>
        set((s) => ({ connection: { ...s.connection, [provider]: status } })),
      appendTurn: (turn) => set((s) => ({ turns: [...s.turns, turn] })),
      patchTurn: (id, patch) =>
        set((s) => ({
          turns: s.turns.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      resetConversation: () =>
        set({
          turns: [],
          interim: "",
          metrics: { stt: 0, llm: 0, tts: 0, total: 0, history: [] },
        }),
      pushMetric: (entry) =>
        set((s) => ({
          metrics: {
            stt: entry.stt,
            llm: entry.llm,
            tts: entry.tts,
            total: entry.total,
            lastTelemetry: entry.lastTelemetry,
            history: [
              ...s.metrics.history,
              { stt: entry.stt, llm: entry.llm, tts: entry.tts, total: entry.total },
            ].slice(-20),
          },
        })),
    }),
    {
      name: "voxera.store",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ apiKeys: s.apiKeys, aiSettings: s.aiSettings }),
    },
  ),
);
