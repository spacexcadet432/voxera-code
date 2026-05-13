import { useEffect, useRef } from "react";

interface WaveformProps {
  analyser: AnalyserNode | null;
  active: boolean;
}

const BARS = 48;

export function Waveform({ analyser, active }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    let raf = 0;
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const tick = () => {
      const bars = barsRef.current;
      if (analyser && data && active) {
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / BARS);
        for (let i = 0; i < BARS; i++) {
          const v = data[i * step] / 255;
          const h = Math.max(4, v * 56);
          if (bars[i]) bars[i].style.height = `${h}px`;
        }
      } else {
        for (let i = 0; i < BARS; i++) {
          if (bars[i]) bars[i].style.height = `4px`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center gap-[3px] h-16"
    >
      {Array.from({ length: BARS }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            if (el) barsRef.current[i] = el;
          }}
          className="w-[3px] rounded-full transition-[height] duration-75"
          style={{
            height: 4,
            background:
              "linear-gradient(to top, oklch(0.50 0.18 230), oklch(0.85 0.22 200))",
            boxShadow: "0 0 6px oklch(0.85 0.22 200 / 0.6)",
          }}
        />
      ))}
    </div>
  );
}
