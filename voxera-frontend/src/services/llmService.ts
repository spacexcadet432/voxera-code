import { chatWithVoxera } from "@/lib/voxera.functions";
import type { ChatRequest, ChatResponse, LlmService } from "./types";

/**
 * LLM service backed by the Lovable AI Gateway through a TanStack server fn.
 * TODO(backend): replace with a FastAPI `/chat` call (OpenAI-keyed) once the
 * Python backend is ready. The interface stays identical.
 */
export function createServerLlmService(
  invoke: (args: { data: ChatRequest }) => Promise<ChatResponse>,
): LlmService {
  return {
    async chat(req: ChatRequest): Promise<ChatResponse> {
      try {
        const res = await invoke({
          data: {
            messages: req.messages,
            systemPrompt: req.systemPrompt,
            personality: req.personality,
            temperature: req.temperature,
          },
        });
        return res;
      } catch (err: any) {
        return { ok: false, error: err?.message ?? "LLM request failed" };
      }
    },
  };
}

export { chatWithVoxera };
