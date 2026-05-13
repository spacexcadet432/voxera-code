import { motion, AnimatePresence } from "framer-motion";
import type { OrbState } from "./Orb";

const LABELS: Record<OrbState | "processing", string> = {
  idle: "Idle",
  listening: "Listening…",
  thinking: "Generating response…",
  speaking: "Speaking…",
  processing: "Processing speech…",
};

export function StatusPill({ state }: { state: OrbState | "processing" }) {
  const dot =
    state === "idle"
      ? "oklch(0.55 0.05 230)"
      : state === "listening"
        ? "oklch(0.85 0.22 200)"
        : state === "thinking" || state === "processing"
          ? "oklch(0.70 0.25 260)"
          : "oklch(0.85 0.18 180)";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25 }}
        className="glass inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 text-xs font-medium tracking-wider uppercase text-foreground/85"
      >
        <motion.span
          className="h-2 w-2 rounded-full"
          style={{ background: dot, boxShadow: `0 0 12px ${dot}` }}
          animate={{ opacity: state === "idle" ? 0.6 : [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
        <span>{LABELS[state]}</span>
      </motion.div>
    </AnimatePresence>
  );
}
