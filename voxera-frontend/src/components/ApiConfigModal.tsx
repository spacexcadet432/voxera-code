import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  CircleCheck,
  CircleX,
  Plug,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useVoxeraStore, type ApiKeys, type ConnectionStatus } from "@/store/voxeraStore";
import { connectionTester } from "@/services";

interface ProviderMeta {
  id: keyof ApiKeys;
  label: string;
  hint: string;
  icon: React.ReactNode;
  placeholder: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "openai",
    label: "OpenAI",
    hint: "Reasoning · GPT models",
    icon: <Sparkles className="h-3.5 w-3.5" />,
    placeholder: "sk-...",
  },
  {
    id: "deepgram",
    label: "Deepgram",
    hint: "Speech-to-text streaming",
    icon: <Cpu className="h-3.5 w-3.5" />,
    placeholder: "deepgram api key",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    hint: "Neural text-to-speech",
    icon: <Plug className="h-3.5 w-3.5" />,
    placeholder: "elevenlabs api key",
  },
];

export function ApiConfigModal() {
  const [open, setOpen] = useState(false);
  const apiKeys = useVoxeraStore((s) => s.apiKeys);
  const connection = useVoxeraStore((s) => s.connection);
  const setApiKeys = useVoxeraStore((s) => s.setApiKeys);
  const setConnection = useVoxeraStore((s) => s.setConnection);

  const [draft, setDraft] = useState<ApiKeys>(apiKeys);
  const [reveal, setReveal] = useState<Record<keyof ApiKeys, boolean>>({
    openai: false,
    deepgram: false,
    elevenlabs: false,
  });
  const [savedFlash, setSavedFlash] = useState(false);

  // Hydrate draft when modal opens or external keys change
  useEffect(() => {
    if (open) setDraft(apiKeys);
  }, [open, apiKeys]);

  const updateDraft = (id: keyof ApiKeys, value: string) => {
    setDraft((d) => ({ ...d, [id]: value }));
    // Mark connection as unknown when key changes
    if (connection[id] !== "unknown") setConnection(id, "unknown");
  };

  const save = () => {
    setApiKeys(draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  };

  const testOne = async (id: keyof ApiKeys) => {
    setConnection(id, "testing");
    const fn =
      id === "openai"
        ? connectionTester.testOpenAI
        : id === "deepgram"
          ? connectionTester.testDeepgram
          : connectionTester.testElevenLabs;
    const res = await fn(draft[id]);
    setConnection(id, res.ok ? "connected" : "error");
  };

  const testAll = async () => {
    await Promise.all(PROVIDERS.map((p) => testOne(p.id)));
  };

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen(true)}
        className="glass fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.22em] text-foreground/85 hover:text-foreground"
        style={{
          boxShadow:
            "0 0 0 1px oklch(0.85 0.22 200 / 0.18), 0 0 24px oklch(0.85 0.22 200 / 0.18)",
        }}
      >
        <KeyRound className="h-3.5 w-3.5" />
        API Configuration
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ type: "spring", damping: 26, stiffness: 240 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 pointer-events-none"
            >
              <div
                className="glass pointer-events-auto relative w-full max-w-xl overflow-hidden rounded-2xl"
                style={{
                  boxShadow:
                    "0 0 0 1px oklch(0.85 0.22 200 / 0.20), 0 30px 80px -20px oklch(0.10 0.05 260 / 0.8), 0 0 60px oklch(0.85 0.22 200 / 0.18)",
                }}
              >
                {/* Top neon edge */}
                <div
                  className="absolute inset-x-0 top-0 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, oklch(0.85 0.22 200 / 0.85), transparent)",
                  }}
                />

                <div className="relative px-7 py-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-foreground/55">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            background: "oklch(0.85 0.22 200)",
                            boxShadow: "0 0 10px oklch(0.85 0.22 200)",
                          }}
                        />
                        System · Credentials
                      </div>
                      <h2 className="mt-2 text-xl font-semibold text-gradient-cyan">
                        API Configuration
                      </h2>
                      <p className="mt-1 text-xs text-foreground/55">
                        Provide credentials for the speech, reasoning, and voice
                        layers. Stored locally in this browser.
                      </p>
                    </div>
                    <button
                      onClick={() => setOpen(false)}
                      className="rounded-full p-1.5 text-foreground/60 hover:bg-secondary/60 hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-6 space-y-3">
                    {PROVIDERS.map((p) => (
                      <KeyField
                        key={p.id}
                        meta={p}
                        value={draft[p.id]}
                        revealed={reveal[p.id]}
                        status={connection[p.id]}
                        onChange={(v) => updateDraft(p.id, v)}
                        onToggleReveal={() =>
                          setReveal((r) => ({ ...r, [p.id]: !r[p.id] }))
                        }
                        onTest={() => testOne(p.id)}
                      />
                    ))}
                  </div>

                  <div className="mt-6 flex items-center justify-between gap-3">
                    <button
                      onClick={testAll}
                      className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-foreground/80 transition hover:text-foreground"
                    >
                      <Plug className="h-3.5 w-3.5" />
                      Test all
                    </button>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={save}
                      className="relative inline-flex items-center gap-2 rounded-full px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-background"
                      style={{
                        background: "var(--gradient-primary, oklch(0.85 0.22 200))",
                        boxShadow:
                          "0 0 0 1px oklch(0.85 0.22 200 / 0.5), 0 0 24px oklch(0.85 0.22 200 / 0.45)",
                      }}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save configuration
                      <AnimatePresence>
                        {savedFlash && (
                          <motion.span
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.6 }}
                            className="absolute -top-7 right-0 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[10px] uppercase tracking-widest text-emerald-300"
                          >
                            <CircleCheck className="h-3 w-3" /> Saved
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>
                </div>

                {/* Bottom soft glow */}
                <div
                  className="pointer-events-none absolute inset-x-10 bottom-0 h-24 blur-3xl"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 100%, oklch(0.78 0.22 220 / 0.45), transparent 70%)",
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

interface KeyFieldProps {
  meta: ProviderMeta;
  value: string;
  revealed: boolean;
  status: ConnectionStatus;
  onChange: (v: string) => void;
  onToggleReveal: () => void;
  onTest: () => void;
}

function KeyField({
  meta,
  value,
  revealed,
  status,
  onChange,
  onToggleReveal,
  onTest,
}: KeyFieldProps) {
  return (
    <div
      className="group relative rounded-xl border border-glass-border bg-input/40 p-3 transition"
      style={{
        boxShadow:
          status === "connected"
            ? "0 0 0 1px oklch(0.78 0.18 160 / 0.45), 0 0 18px oklch(0.78 0.18 160 / 0.18)"
            : status === "error"
              ? "0 0 0 1px oklch(0.65 0.20 25 / 0.45), 0 0 18px oklch(0.65 0.20 25 / 0.18)"
              : undefined,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-secondary/60 text-foreground/80">
            {meta.icon}
          </span>
          <div>
            <div className="text-xs font-semibold tracking-wider text-foreground/85">
              {meta.label}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-foreground/45">
              {meta.hint}
            </div>
          </div>
        </div>
        <StatusDot status={status} />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={revealed ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={meta.placeholder}
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-lg border border-glass-border bg-background/60 px-3 py-2 pr-10 font-mono text-xs tracking-wider text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={onToggleReveal}
            type="button"
            tabIndex={-1}
            aria-label={revealed ? "Hide key" : "Show key"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-foreground/55 hover:text-foreground"
          >
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <button
          onClick={onTest}
          disabled={!value || status === "testing"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-glass-border bg-secondary/40 px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-foreground/80 transition hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "testing" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plug className="h-3 w-3" />
          )}
          Test
        </button>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  const map = {
    unknown: { label: "Idle", color: "oklch(0.6 0 0)", icon: null as React.ReactNode },
    testing: {
      label: "Testing",
      color: "oklch(0.78 0.18 220)",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    connected: {
      label: "Online",
      color: "oklch(0.78 0.18 160)",
      icon: <CircleCheck className="h-3 w-3" />,
    },
    error: {
      label: "Error",
      color: "oklch(0.65 0.20 25)",
      icon: <CircleX className="h-3 w-3" />,
    },
  } as const;
  const s = map[status];
  return (
    <motion.span
      key={status}
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-flex items-center gap-1.5 rounded-full bg-background/40 px-2 py-0.5 text-[10px] uppercase tracking-widest"
      style={{ color: s.color }}
    >
      {s.icon ?? (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }}
        />
      )}
      {s.label}
    </motion.span>
  );
}
