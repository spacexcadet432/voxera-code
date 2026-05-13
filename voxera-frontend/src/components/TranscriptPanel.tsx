import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
}

export function TranscriptPanel({
  turns,
  interim,
}: {
  turns: Turn[];
  interim: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, interim]);

  return (
    <div className="glass rounded-2xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-glass-border">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-foreground/60">
          Transcript
        </h3>
        <span className="text-[10px] text-foreground/40 tracking-wider">
          {turns.length} turn{turns.length === 1 ? "" : "s"}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[180px] max-h-[42vh]"
      >
        {turns.length === 0 && !interim && (
          <p className="text-sm text-foreground/40 italic">
            Press Start and speak. Transcripts will appear here.
          </p>
        )}
        <AnimatePresence initial={false}>
          {turns.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={
                t.role === "user"
                  ? "ml-auto max-w-[85%] rounded-xl bg-secondary/40 px-3.5 py-2 text-sm text-foreground/90 border border-glass-border"
                  : "mr-auto max-w-[88%] rounded-xl px-3.5 py-2 text-sm text-foreground border"
              }
              style={
                t.role === "assistant"
                  ? {
                      background:
                        "linear-gradient(135deg, oklch(0.20 0.04 240 / 0.7), oklch(0.18 0.06 260 / 0.5))",
                      borderColor: "oklch(0.78 0.18 220 / 0.25)",
                      boxShadow: "0 0 20px oklch(0.78 0.20 215 / 0.18)",
                    }
                  : undefined
              }
            >
              <div className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">
                {t.role === "user" ? "You" : "Voxera"}
              </div>
              <div>{t.text}{t.pending && <span className="opacity-50"> ▍</span>}</div>
            </motion.div>
          ))}
        </AnimatePresence>
        {interim && (
          <div className="ml-auto max-w-[85%] rounded-xl border border-dashed border-glass-border bg-secondary/20 px-3.5 py-2 text-sm italic text-foreground/60">
            <div className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">
              You (live)
            </div>
            {interim}
          </div>
        )}
      </div>
    </div>
  );
}
