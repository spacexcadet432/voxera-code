import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Orb } from "@/components/Orb";
import { Waveform } from "@/components/Waveform";
import { VoiceControls } from "@/components/VoiceControls";
import { StatusPill } from "@/components/StatusPill";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { PipelineMetrics } from "@/components/PipelineMetrics";
import { ApiConfigModal } from "@/components/ApiConfigModal";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { useVoxeraStore } from "@/store/voxeraStore";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voxera — Realtime AI Voice Interface" },
      {
        name: "description",
        content:
          "Voxera is a cinematic realtime AI voice interface. Speak, see live transcripts, and watch the orb react in real time.",
      },
      { property: "og:title", content: "Voxera — Realtime AI Voice Interface" },
      {
        property: "og:description",
        content:
          "A futuristic realtime AI voice experience with reactive orb, live transcripts, and pipeline metrics.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: VoxeraPage,
});

function VoxeraPage() {
  const session = useVoiceSession();

  const status = useVoxeraStore((s) => s.status);
  const active = useVoxeraStore((s) => s.active);
  const muted = useVoxeraStore((s) => s.muted);
  const amplitude = useVoxeraStore((s) => s.amplitude);
  const turns = useVoxeraStore((s) => s.turns);
  const interim = useVoxeraStore((s) => s.interim);
  const metrics = useVoxeraStore((s) => s.metrics);
  const error = useVoxeraStore((s) => s.error);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden">
      <AmbientBackground />

      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 pt-5">
        <div className="flex items-center gap-2.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: "oklch(0.85 0.22 200)",
              boxShadow: "0 0 14px oklch(0.85 0.22 200)",
            }}
          />
          <span className="text-sm font-semibold tracking-[0.3em] uppercase text-foreground/85">
            Voxera
          </span>
        </div>
        <span className="text-[10px] tracking-widest uppercase text-foreground/40">
          v1.0 · realtime
        </span>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-5 sm:px-8 pt-8 pb-32">
        <div className="mb-6">
          <StatusPill state={status} />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-4"
        >
          <Orb
            state={status === "processing" ? "thinking" : (status as any)}
            amplitude={amplitude}
          />
        </motion.div>

        <div className="w-full max-w-md mb-8">
          <Waveform analyser={session.analyser} active={active && !muted} />
        </div>

        <div className="mb-4">
          <VoiceControls
            active={active}
            muted={muted}
            onStart={session.start}
            onStop={session.stop}
            onToggleMute={session.toggleMute}
          />
        </div>

        <div className="min-h-[24px] mb-8 text-center">
          {!session.supported && (
            <p className="text-xs text-destructive/90">
              Voice input isn't supported in this browser. Try Chrome or Edge.
            </p>
          )}
          {error && <p className="text-xs text-destructive/90">{error}</p>}
          {session.supported && !active && !error && (
            <p className="text-xs text-foreground/45">
              Press Start and speak naturally. Voxera will listen, think, and respond.
            </p>
          )}
        </div>

        <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          <TranscriptPanel turns={turns} interim={interim} />
          <PipelineMetrics metrics={metrics} />
        </div>
      </main>

      <ApiConfigModal />
    </div>
  );
}
