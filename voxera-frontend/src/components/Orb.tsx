import { motion } from "framer-motion";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

interface OrbProps {
  state: OrbState;
  /** 0..1 audio amplitude */
  amplitude: number;
}

export function Orb({ state, amplitude }: OrbProps) {
  const isActive = state !== "idle";
  const reactive = state === "listening" || state === "speaking";
  const scale = reactive ? 1 + amplitude * 0.18 : 1;

  return (
    <div className="relative flex items-center justify-center">
      {/* outer expanding rings (speaking) */}
      {state === "speaking" && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="pointer-events-none absolute rounded-full border border-cyan/40"
              initial={{ width: 220, height: 220, opacity: 0.6 }}
              animate={{
                width: [220, 460],
                height: [220, 460],
                opacity: [0.6, 0],
              }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: i * 0.8,
                ease: "easeOut",
              }}
              style={{ borderColor: "oklch(0.85 0.22 200 / 0.5)" }}
            />
          ))}
        </>
      )}

      {/* ambient halo */}
      <motion.div
        className="pointer-events-none absolute rounded-full blur-3xl"
        style={{
          width: 380,
          height: 380,
          background:
            "radial-gradient(circle, oklch(0.78 0.20 215 / 0.55) 0%, transparent 70%)",
        }}
        animate={{
          opacity: isActive ? [0.7, 1, 0.7] : [0.4, 0.55, 0.4],
          scale: isActive ? [0.95, 1.08, 0.95] : [0.92, 1, 0.92],
        }}
        transition={{
          duration: state === "thinking" ? 1.6 : 3.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* main orb */}
      <motion.div
        className="relative rounded-full"
        style={{
          width: 240,
          height: 240,
          background: "var(--gradient-orb)",
          boxShadow:
            "inset -30px -40px 80px oklch(0.10 0.05 260 / 0.7), inset 30px 30px 80px oklch(0.95 0.18 200 / 0.4), 0 0 80px oklch(0.78 0.22 210 / 0.45)",
        }}
        animate={{
          scale,
          rotate: state === "thinking" ? 360 : 0,
        }}
        transition={{
          scale: { duration: 0.15, ease: "easeOut" },
          rotate: {
            duration: 8,
            repeat: state === "thinking" ? Infinity : 0,
            ease: "linear",
          },
        }}
      >
        {/* inner swirl */}
        <motion.div
          className="absolute inset-4 rounded-full opacity-70"
          style={{
            background:
              "conic-gradient(from 0deg, transparent, oklch(0.95 0.18 200 / 0.5), transparent, oklch(0.70 0.25 260 / 0.5), transparent)",
            filter: "blur(14px)",
          }}
          animate={{ rotate: 360 }}
          transition={{
            duration: state === "thinking" ? 4 : 14,
            repeat: Infinity,
            ease: "linear",
          }}
        />

        {/* highlight */}
        <div
          className="absolute rounded-full"
          style={{
            top: "12%",
            left: "18%",
            width: "38%",
            height: "30%",
            background:
              "radial-gradient(ellipse, oklch(1 0 0 / 0.55) 0%, transparent 70%)",
            filter: "blur(6px)",
          }}
        />

        {/* thinking flicker */}
        {state === "thinking" && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle, oklch(0.95 0.20 200 / 0.3) 0%, transparent 60%)",
            }}
            animate={{ opacity: [0.2, 0.8, 0.3, 0.9, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
      </motion.div>
    </div>
  );
}
