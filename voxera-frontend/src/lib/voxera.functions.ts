import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(50),
  systemPrompt: z.string().max(4000).optional(),
  personality: z.string().max(200).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const chatWithVoxera = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI gateway not configured." };
    }

    const baseSystem =
      data.systemPrompt?.trim() ||
      "You are Voxera, a calm, intelligent realtime voice AI. Reply in 1-3 short conversational sentences suitable for being spoken aloud. Avoid markdown, lists, or code blocks.";
    const personality = data.personality?.trim();
    const system = personality
      ? `${baseSystem}\n\nPersonality: ${personality}.`
      : baseSystem;

    const startedAt = Date.now();
    try {
      const res = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "system", content: system }, ...data.messages],
            temperature: data.temperature ?? 0.8,
          }),
        },
      );

      if (!res.ok) {
        if (res.status === 429) {
          return {
            ok: false as const,
            error: "Rate limit reached. Please slow down.",
          };
        }
        if (res.status === 402) {
          return {
            ok: false as const,
            error: "AI credits exhausted. Add funds in workspace settings.",
          };
        }
        const text = await res.text();
        console.error("AI gateway error:", res.status, text);
        return { ok: false as const, error: "AI gateway error." };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const reply = json.choices?.[0]?.message?.content?.trim() ?? "";
      return {
        ok: true as const,
        reply,
        latencyMs: Date.now() - startedAt,
      };
    } catch (err) {
      console.error("chatWithVoxera failed:", err);
      return { ok: false as const, error: "AI request failed." };
    }
  });
