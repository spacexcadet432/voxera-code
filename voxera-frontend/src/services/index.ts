/**
 * Service registry — single import surface for all backends.
 *
 * Voice pipeline: FastAPI WebSocket (`useVoiceSession`) + Deepgram/OpenAI/ElevenLabs on the server.
 * Connection tests hit `/api/verify/*` on the same backend.
 *
 * Legacy browser/TanStack server implementations remain in this folder for reference
 * (`sttService.ts`, `ttsService.ts`, `llmService.ts`) but are no longer the default wiring.
 */
export { browserSttService as sttService } from "./sttService";
export { browserTtsService as ttsService } from "./ttsService";
export { createServerLlmService } from "./llmService";
export { connectionTester } from "./connectionTester";
export type * from "./types";
