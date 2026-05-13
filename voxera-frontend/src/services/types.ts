/**
 * Service interfaces for the Voxera voice pipeline.
 *
 * These define the contract between the frontend and the speech/LLM backends.
 * Current implementations use the browser Web Speech API + a TanStack server
 * function. They can later be swapped for a Python FastAPI + WebSocket backend
 * (Deepgram for STT, OpenAI for LLM, ElevenLabs for TTS) without touching UI
 * components — only `src/services/index.ts` needs to be re-wired.
 */

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  personality?: string;
  temperature?: number;
  apiKey?: string;
}

export type ChatResponse =
  | { ok: true; reply: string; latencyMs: number }
  | { ok: false; error: string };

export interface LlmService {
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export interface SttCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: string) => void;
  onEnd?: () => void;
}

export interface SttSession {
  stop: () => void;
}

export interface SttService {
  isSupported(): boolean;
  start(opts: { lang?: string; apiKey?: string } & SttCallbacks): Promise<SttSession>;
}

export interface TtsRequest {
  text: string;
  voice?: string;
  apiKey?: string;
  onStart?: () => void;
  onAmplitude?: (amp: number) => void;
}

export interface TtsService {
  speak(req: TtsRequest): Promise<number>; // returns latency ms
  cancel(): void;
}

export type ConnectionTestResult =
  | { ok: true }
  | { ok: false; error: string };

export interface ConnectionTester {
  testOpenAI(key: string): Promise<ConnectionTestResult>;
  testDeepgram(key: string): Promise<ConnectionTestResult>;
  testElevenLabs(key: string): Promise<ConnectionTestResult>;
}
