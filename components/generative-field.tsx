"use client";

import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

// Deterministic PRNG (mulberry32) — same seed ⇒ same field.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Particle = { x: number; y: number; px: number; py: number; life: number };

/**
 * The one piece of "art" (design-system.md §Generative accent): a deterministic
 * seeded flow-field on canvas, cobalt-tinted at low opacity, strictly behind
 * content (aria-hidden, pointer-events-none). Slow drift only; fully paused (a
 * single static frame) under prefers-reduced-motion.
 */
export function GenerativeField({
  seed = 7,
  density = 700,
  motion = true,
  className,
}: {
  seed?: number;
  density?: number;
  motion?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const animate = motion && !reduced;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    const rng = mulberry32(Math.imul(seed || 1, 2654435761));
    const stroke = "rgba(37, 99, 235, 0.22)"; // cobalt, low alpha

    function field(x: number, y: number): number {
      const s = seed * 0.15;
      return (
        (Math.sin(x * 0.0042 + s) +
          Math.cos(y * 0.0042 - s * 0.7) +
          Math.sin((x + y) * 0.0026 + s * 0.3)) *
        1.1
      );
    }

    function spawn(): Particle {
      const x = rng() * width;
      const y = rng() * height;
      return { x, y, px: x, py: y, life: 60 + rng() * 160 };
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (width === 0 || height === 0) return;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: density }, spawn);
      ctx!.clearRect(0, 0, width, height);
    }

    function step() {
      if (width === 0 || height === 0) return;
      // Fade existing trails toward transparent (no colour tint) — bounds buildup.
      ctx!.globalCompositeOperation = "destination-out";
      ctx!.fillStyle = "rgba(0,0,0,0.035)";
      ctx!.fillRect(0, 0, width, height);
      ctx!.globalCompositeOperation = "source-over";

      ctx!.strokeStyle = stroke;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      for (const p of particles) {
        p.px = p.x;
        p.py = p.y;
        const a = field(p.x, p.y);
        p.x += Math.cos(a) * 0.8;
        p.y += Math.sin(a) * 0.8;
        p.life -= 1;
        if (
          p.life <= 0 ||
          p.x < -5 ||
          p.x > width + 5 ||
          p.y < -5 ||
          p.y > height + 5
        ) {
          Object.assign(p, spawn());
          continue;
        }
        ctx!.moveTo(p.px, p.py);
        ctx!.lineTo(p.x, p.y);
      }
      ctx!.stroke();
    }

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    if (animate) {
      const loop = () => {
        step();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else {
      // Static frame: advance a fixed, deterministic number of steps, then stop.
      for (let i = 0; i < 140; i++) step();
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [seed, density, animate]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none block size-full", className)}
    />
  );
}
