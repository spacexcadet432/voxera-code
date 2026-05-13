import { motion } from "framer-motion";

export interface Metrics {
  stt: number;
  llm: number;
  tts: number;
  total: number;
  history: { stt: number; llm: number; tts: number; total: number }[];
}

export function PipelineMetrics({ metrics }: { metrics: Metrics }) {
  return (
    <div className="glass rounded-2xl p-4 h-full">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-glass-border">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-foreground/60">
          Realtime Pipeline
        </h3>
        <Activity />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="STT" value={metrics.stt} unit="ms" series={metrics.history.map(h => h.stt)} hue={200} />
        <MetricCard label="LLM" value={metrics.llm} unit="ms" series={metrics.history.map(h => h.llm)} hue={230} />
        <MetricCard label="TTS" value={metrics.tts} unit="ms" series={metrics.history.map(h => h.tts)} hue={260} />
        <MetricCard label="TOTAL" value={metrics.total} unit="ms" series={metrics.history.map(h => h.total)} hue={180} />
      </div>
    </div>
  );
}

function Activity() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-1 w-1 rounded-full bg-cyan"
          style={{ background: "oklch(0.85 0.22 200)" }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  series,
  hue,
}: {
  label: string;
  value: number;
  unit: string;
  series: number[];
  hue: number;
}) {
  const max = Math.max(1, ...series, value);
  const points = series.length
    ? series.map((v, i) => `${(i / Math.max(1, series.length - 1)) * 100},${100 - (v / max) * 100}`).join(" ")
    : "";
  const color = `oklch(0.82 0.20 ${hue})`;

  return (
    <div
      className="rounded-xl border border-glass-border p-3 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, oklch(0.18 0.04 ${hue} / 0.5), oklch(0.14 0.03 ${hue} / 0.3))`,
      }}
    >
      <div className="text-[10px] uppercase tracking-widest text-foreground/55">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <motion.span
          key={value}
          initial={{ opacity: 0.4, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-semibold tabular-nums"
          style={{ color }}
        >
          {value > 0 ? Math.round(value) : "—"}
        </motion.span>
        {value > 0 && <span className="text-[10px] text-foreground/45">{unit}</span>}
      </div>
      {series.length > 1 && (
        <svg
          className="absolute bottom-1 left-1 right-1 h-8 opacity-70"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            points={points}
            style={{ filter: `drop-shadow(0 0 3px ${color})` }}
          />
        </svg>
      )}
    </div>
  );
}
