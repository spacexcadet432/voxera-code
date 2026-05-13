import { motion } from "framer-motion";
import { Mic, MicOff, Play, Square } from "lucide-react";

interface VoiceControlsProps {
  active: boolean;
  muted: boolean;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}

export function VoiceControls({
  active,
  muted,
  onStart,
  onStop,
  onToggleMute,
}: VoiceControlsProps) {
  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4">
      {!active ? (
        <PrimaryButton onClick={onStart} label="Start" icon={<Play className="h-4 w-4" />} />
      ) : (
        <PrimaryButton
          onClick={onStop}
          label="Stop"
          icon={<Square className="h-4 w-4" />}
          variant="danger"
        />
      )}
      <GhostButton
        onClick={onToggleMute}
        label={muted ? "Unmute" : "Mute"}
        icon={muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        active={!muted && active}
      />
    </div>
  );
}

function PrimaryButton({
  onClick,
  label,
  icon,
  variant = "primary",
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  variant?: "primary" | "danger";
}) {
  const isDanger = variant === "danger";
  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="group relative inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-foreground transition-colors"
      style={{
        background: isDanger
          ? "linear-gradient(135deg, oklch(0.55 0.22 25), oklch(0.45 0.20 15))"
          : "linear-gradient(135deg, oklch(0.78 0.20 215), oklch(0.55 0.22 250))",
        boxShadow: isDanger
          ? "0 0 30px oklch(0.55 0.22 25 / 0.45)"
          : "0 0 30px oklch(0.78 0.22 215 / 0.5)",
      }}
    >
      <span className="absolute inset-0 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
        style={{ boxShadow: "inset 0 0 20px oklch(1 0 0 / 0.2)" }} />
      {icon}
      <span>{label}</span>
    </motion.button>
  );
}

function GhostButton({
  onClick,
  label,
  icon,
  active,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="glass inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-foreground/90 transition-colors hover:text-foreground"
      style={{
        boxShadow: active ? "var(--glow-soft)" : undefined,
      }}
    >
      {icon}
      <span>{label}</span>
    </motion.button>
  );
}
