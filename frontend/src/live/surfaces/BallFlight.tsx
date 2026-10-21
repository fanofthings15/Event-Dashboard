import { useEffect, useRef, useState } from "react";

type BaseCode = "home" | "1B" | "2B" | "3B";

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
  throws?: BaseCode[]; // bases thrown to, in order (["2B", "1B"] on a double play)
  runners?: { from: BaseCode; to: BaseCode; out: boolean }[];
}

const G = 32.2; // ft/s²
const MPH = 1.4667; // ft/s per mph
const B = 90 / Math.SQRT2;
const BASE_AT: Record<BaseCode, [number, number]> = { home: [0, 0], "1B": [B, B], "2B": [0, 2 * B], "3B": [-B, B] };
const ORDER: BaseCode[] = ["home", "1B", "2B", "3B", "home"];
const THROW_MS = 700;
const LEG_MS = 1300; // one base path (90 ft); quicker than real so the play reads at a glance

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

// The bases a runner passes through, start to finish (1B→3B goes via 2B).
function legs(from: BaseCode, to: BaseCode): [number, number][] {
  const start = from === "home" ? 0 : ORDER.indexOf(from);
  const end = to === "home" ? 4 : ORDER.indexOf(to);
  const out: [number, number][] = [];
  for (let i = start; i <= Math.max(start, end); i++) out.push(BASE_AT[ORDER[i]]);
  return out;
}

function along(path: [number, number][], ms: number): [number, number] {
  if (path.length < 2) return path[0];
  const leg = Math.min(path.length - 2, Math.floor(ms / LEG_MS));
  const f = Math.min(1, (ms - leg * LEG_MS) / LEG_MS);
  const [ax, ay] = path[leg];
  const [bx, by] = path[leg + 1];
  return [ax + (bx - ax) * f, ay + (by - ay) * f];
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

// Plays a newly batted ball inside the Ballpark SVG (feet, y flipped): the
// ball's flight from home plate (it grows with height, its shadow tracks the
// ground), then any throws for outs in order (a double play relays base to
// base), while every runner — batter included — runs the base paths to where
// they ended up. Afterwards the play's result stays marked until the next
// ball in play. A hit that was already the latest when the view opened just
// shows its final state.
export default function BallFlight({ hit }: { hit: FlightHit | undefined }) {
  const first = useRef<string | undefined>(hit?.id);
  const [elapsed, setElapsed] = useState(Infinity);

  const throws = hit?.throws ?? [];
  const runners = hit?.runners ?? [];
  const flightMs = hit ? profile(hit).ms : 0;
  const runMs = Math.max(0, ...runners.map((r) => (legs(r.from, r.to).length - 1) * LEG_MS));
  const totalMs = Math.max(flightMs + (throws.length ? 150 + throws.length * THROW_MS : 0), runMs) + 300;

  useEffect(() => {
    if (!hit || hit.id === first.current) return;
    first.current = undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setElapsed(Infinity);
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const e = now - start;
      setElapsed(e);
      if (e < totalMs) raf = requestAnimationFrame(step);
      else setElapsed(Infinity);
    };
    setElapsed(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [hit?.id]);

  if (!hit) return null;
  const { grounder, apex } = profile(hit);
  const done = elapsed === Infinity;
  const t = Math.min(1, elapsed / flightMs);
  const flying = !done && t < 1;
  const label = [hit.distance ? `${Math.round(hit.distance)} ft` : null, hit.speed ? `${Math.round(hit.speed)} mph` : null].filter(Boolean).join(" · ");

  // Throw chain: fielding spot → first base thrown to → next…
  const throwPoints: [number, number][] = [[hit.x, hit.y], ...throws.map((b) => BASE_AT[b])];
  const throwElapsed = elapsed - flightMs - 150;
  const throwLeg = Math.floor(throwElapsed / THROW_MS);
  const throwsDone = done || throwLeg >= throws.length;

  let ball: { x: number; y: number; height: number } | null = null;
  if (flying) {
    // grounders skip: a few shrinking hops instead of one arc
    const height = grounder ? Math.abs(Math.sin(t * Math.PI * 3)) * 6 * (1 - t) : 4 * apex * t * (1 - t);
    ball = { x: hit.x * t, y: hit.y * t, height };
  } else if (!done && throws.length && throwElapsed >= 0 && !throwsDone) {
    const f = (throwElapsed - throwLeg * THROW_MS) / THROW_MS;
    const [ax, ay] = throwPoints[throwLeg];
    const [bx, by] = throwPoints[throwLeg + 1];
    ball = { x: ax + (bx - ax) * f, y: ay + (by - ay) * f, height: 4 * 12 * f * (1 - f) };
  }
  // throw lines drawn so far
  const drawnThrows = done ? throws.length : Math.max(0, Math.min(throws.length, throwElapsed >= 0 ? throwLeg + 1 : 0));

  return (
    <g pointerEvents="none">
      {flying && <line x1={0} y1={0} x2={hit.x * t} y2={-hit.y * t} stroke="#fff" strokeOpacity={0.45} strokeWidth={2.5} strokeDasharray="6 6" />}
      {!flying && <circle cx={hit.x} cy={-hit.y} r={5} fill="#fff" stroke="#c81e1e" strokeWidth={1.2} />}
      {Array.from({ length: drawnThrows }, (_, i) => {
        const [ax, ay] = throwPoints[i];
        const [bx, by] = throwPoints[i + 1];
        const partial = !done && i === throwLeg ? (throwElapsed - i * THROW_MS) / THROW_MS : 1;
        return <line key={i} x1={ax} y1={-ay} x2={ax + (bx - ax) * partial} y2={-(ay + (by - ay) * partial)} stroke="#facc15" strokeWidth={3} strokeDasharray="8 6" />;
      })}
      {/* runners on the move (once the play is over the base lights show where they ended up) */}
      {!done &&
        runners.map((r, i) => {
          const path = legs(r.from, r.to);
          const [x, y] = along(path, elapsed);
          const arrived = elapsed >= (path.length - 1) * LEG_MS;
          return (
            <g key={i}>
              <circle cx={x} cy={-y} r={9} fill={r.out && arrived && throwsDone ? "#f87171" : "#facc15"} stroke="#1f2937" strokeWidth={2.5} />
            </g>
          );
        })}
      {ball && <Ball {...ball} />}
      {done && throws.map((b) => <Tag key={b} x={BASE_AT[b][0]} y={BASE_AT[b][1]} text="OUT" color="#f87171" />)}
      {done && !throws.length && <circle cx={hit.x} cy={-hit.y} r={11} fill="none" stroke="#fff" strokeWidth={2} className="live-pulse" />}
      {done && !throws.length && <Tag x={hit.x} y={hit.y} text={hit.out ? `OUT · ${label}` : label} color={hit.out ? "#f87171" : "#fff"} />}
      {done && throws.length > 0 && label && <Tag x={hit.x} y={hit.y} text={label} />}
    </g>
  );
}
