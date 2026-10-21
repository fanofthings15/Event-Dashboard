import { useEffect, useRef, useState } from "react";

export interface FlightHit {
  id: string;
  x: number; // landing / fielding spot, feet (home plate at origin, +y toward centre)
  y: number;
  speed?: number; // mph
  angle?: number; // degrees
  distance?: number;
  trajectory?: string;
  result?: string;
  out?: boolean;
  throwTo?: "1B" | "2B" | "3B" | "home";
}

const G = 32.2; // ft/s²
const MPH = 1.4667; // ft/s per mph
const B = 90 / Math.SQRT2;
const BASE_AT: Record<NonNullable<FlightHit["throwTo"]>, [number, number]> = {
  "1B": [B, B],
  "2B": [0, 2 * B],
  "3B": [-B, B],
  home: [0, 0],
};
const THROW_MS = 750;

// Rough flight profile from exit velocity and launch angle. Real balls lose
// a lot to drag, so the vacuum hang time and apex are scaled down to look
// right; it's a picture of the play, not a physics model.
function profile(h: FlightHit) {
  const v = (h.speed ?? 85) * MPH;
  const a = ((h.angle ?? 15) * Math.PI) / 180;
  const grounder = h.trajectory === "ground_ball" || (h.angle ?? 15) < 8;
  if (grounder) {
    const dist = Math.hypot(h.x, h.y);
    return { grounder, ms: Math.min(2200, Math.max(600, (dist / (v * 0.55)) * 1000)), apex: 0 };
  }
  const hang = (2 * v * Math.sin(a)) / G;
  return {
    grounder,
    ms: Math.min(4500, Math.max(700, hang * 0.7 * 1000)),
    apex: Math.min(170, (((v * Math.sin(a)) ** 2) / (2 * G)) * 0.55),
  };
}

function Ball({ x, y, height }: { x: number; y: number; height: number }) {
  return (
    <>
      <ellipse cx={x} cy={-y} rx={8 + height * 0.04} ry={5 + height * 0.025} fill="#000" fillOpacity={0.35} />
      <circle cx={x} cy={-y - height * 0.55} r={8 + height * 0.12} fill="#fff" stroke="#c81e1e" strokeWidth={2} />
    </>
  );
}

function Tag({ x, y, text, color = "#fff" }: { x: number; y: number; text: string; color?: string }) {
  return (
    <text x={x} y={-y - 18} fontSize={15} fontWeight={900} fill={color} textAnchor="middle" stroke="#1f2937" strokeWidth={3.5} paintOrder="stroke">
      {text}
    </text>
  );
}

// Plays a newly batted ball inside the Ballpark SVG (feet, y flipped): its
// flight from home plate (ball grows with height, shadow tracks the ground),
// then — when the out came on a throw — the throw to that base. Afterwards
// the landing spot stays marked until the next ball in play. A hit that was
// already the latest when the view opened just shows its final state.
export default function BallFlight({ hit }: { hit: FlightHit | undefined }) {
  const first = useRef<string | undefined>(hit?.id);
  const [elapsed, setElapsed] = useState(Infinity);

  useEffect(() => {
    if (!hit || hit.id === first.current) return;
    first.current = undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setElapsed(Infinity);
    const total = profile(hit).ms + (hit.throwTo ? THROW_MS + 150 : 0);
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const e = now - start;
      setElapsed(e);
      if (e < total) raf = requestAnimationFrame(step);
      else setElapsed(Infinity);
    };
    setElapsed(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [hit?.id]);

  if (!hit) return null;
  const { grounder, apex, ms } = profile(hit);
  const t = Math.min(1, elapsed / ms);
  const flying = t < 1;
  const throwT = hit.throwTo ? Math.min(1, Math.max(0, (elapsed - ms - 150) / THROW_MS)) : 1;
  const throwing = !flying && hit.throwTo && throwT < 1;
  const done = !flying && !throwing;
  const base = hit.throwTo ? BASE_AT[hit.throwTo] : undefined;
  const label = [hit.distance ? `${Math.round(hit.distance)} ft` : null, hit.speed ? `${Math.round(hit.speed)} mph` : null].filter(Boolean).join(" · ");

  let ball: { x: number; y: number; height: number } | null = null;
  if (flying) {
    // grounders skip: a few shrinking hops instead of one arc
    const height = grounder ? Math.abs(Math.sin(t * Math.PI * 3)) * 6 * (1 - t) : 4 * apex * t * (1 - t);
    ball = { x: hit.x * t, y: hit.y * t, height };
  } else if (throwing && base) {
    ball = { x: hit.x + (base[0] - hit.x) * throwT, y: hit.y + (base[1] - hit.y) * throwT, height: 4 * 12 * throwT * (1 - throwT) };
  }

  return (
    <g pointerEvents="none">
      {flying && <line x1={0} y1={0} x2={hit.x * t} y2={-hit.y * t} stroke="#fff" strokeOpacity={0.45} strokeWidth={2.5} strokeDasharray="6 6" />}
      {!flying && (
        <>
          <circle cx={hit.x} cy={-hit.y} r={5} fill="#fff" stroke="#c81e1e" strokeWidth={1.2} />
          {done && !hit.throwTo && <circle cx={hit.x} cy={-hit.y} r={11} fill="none" stroke="#fff" strokeWidth={2} className="live-pulse" />}
          {base && (
            <line
              x1={hit.x}
              y1={-hit.y}
              x2={hit.x + (base[0] - hit.x) * throwT}
              y2={-(hit.y + (base[1] - hit.y) * throwT)}
              stroke="#facc15"
              strokeWidth={3}
              strokeDasharray="8 6"
            />
          )}
        </>
      )}
      {ball && <Ball {...ball} />}
      {done && base && <Tag x={base[0]} y={base[1]} text="OUT" color="#f87171" />}
      {done && !base && <Tag x={hit.x} y={hit.y} text={hit.out ? `OUT · ${label}` : label} color={hit.out ? "#f87171" : "#fff"} />}
      {done && base && label && <Tag x={hit.x} y={hit.y} text={label} />}
    </g>
  );
}
