import { useEffect, useRef, useState } from "react";

export interface FlightHit {
  id: string;
  x: number; // landing spot, feet (home plate at origin, +y toward centre)
  y: number;
  speed?: number; // mph
  angle?: number; // degrees
  distance?: number;
  trajectory?: string;
}

const G = 32.2; // ft/s²
const MPH = 1.4667; // ft/s per mph

// Rough flight profile from exit velocity and launch angle. Real balls lose
// a lot to drag, so the vacuum hang time and apex are scaled down to look
// right; it's a picture of the hit, not a physics model.
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

// Plays the flight of a newly batted ball inside the Ballpark SVG (feet,
// y flipped). The ball grows with height and its shadow tracks along the
// ground; once it lands, a marker stays until the next hit. A hit that was
// already the latest when the view opened just shows its landing marker.
export default function BallFlight({ hit }: { hit: FlightHit | undefined }) {
  const first = useRef<string | undefined>(hit?.id);
  const [t, setT] = useState(1);

  useEffect(() => {
    if (!hit || hit.id === first.current) return;
    first.current = undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setT(1);
    const { ms } = profile(hit);
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setT(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    setT(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [hit?.id]);

  if (!hit) return null;
  const { grounder, apex } = profile(hit);
  // grounders skip: a few shrinking hops instead of one arc
  const height = grounder ? Math.abs(Math.sin(t * Math.PI * 3)) * 6 * (1 - t) : 4 * apex * t * (1 - t);
  const gx = hit.x * t;
  const gy = hit.y * t;
  const landed = t >= 1;
  const label = [hit.distance ? `${Math.round(hit.distance)} ft` : null, hit.speed ? `${Math.round(hit.speed)} mph` : null].filter(Boolean).join(" · ");

  return (
    <g pointerEvents="none">
      {!landed && (
        <>
          <line x1={0} y1={0} x2={gx} y2={-gy} stroke="#fff" strokeOpacity={0.45} strokeWidth={2.5} strokeDasharray="6 6" />
          <ellipse cx={gx} cy={-gy} rx={8 + height * 0.04} ry={5 + height * 0.025} fill="#000" fillOpacity={0.35} />
          <circle cx={gx} cy={-gy - height * 0.55} r={8 + height * 0.12} fill="#fff" stroke="#c81e1e" strokeWidth={2} />
        </>
      )}
      {landed && (
        <>
          <circle cx={hit.x} cy={-hit.y} r={11} fill="none" stroke="#fff" strokeWidth={2} className="live-pulse" />
          <circle cx={hit.x} cy={-hit.y} r={5} fill="#fff" stroke="#c81e1e" strokeWidth={1.2} />
          {label && (
            <text
              x={hit.x}
              y={-hit.y - 18}
              fontSize={14}
              fontWeight={800}
              fill="#fff"
              textAnchor="middle"
              stroke="#1f2937"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {label}
            </text>
          )}
        </>
      )}
    </g>
  );
}
