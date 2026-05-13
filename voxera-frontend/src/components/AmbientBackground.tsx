import { useEffect, useRef } from "react";

export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number };
    let particles: P[] = [];

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.floor((w * h) / 18000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: Math.random() * 1.6 + 0.4,
        a: Math.random() * 0.5 + 0.2,
      }));
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(140, 220, 255, ${p.a * 0.6})`;
        ctx.shadowColor = "rgba(120, 200, 255, 0.8)";
        ctx.shadowBlur = 8;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    tick();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* gradient blooms */}
      <div
        className="absolute -top-40 -left-40 h-[60vmin] w-[60vmin] rounded-full opacity-40 blur-3xl animate-voxera-drift"
        style={{
          background:
            "radial-gradient(circle, oklch(0.55 0.22 230) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[70vmin] w-[70vmin] rounded-full opacity-35 blur-3xl animate-voxera-drift"
        style={{
          background:
            "radial-gradient(circle, oklch(0.50 0.24 280) 0%, transparent 70%)",
          animationDelay: "-9s",
        }}
      />
      {/* grid */}
      <div className="absolute inset-0 grid-overlay opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      {/* particles */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,oklch(0.08_0.02_250)_100%)]" />
    </div>
  );
}
