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
// Real-world pace: a batter reaches first in about 4.3 s, a runner covers a
// 90 ft base path in about 3.7 s, a fielder takes ~0.45 s to transfer and
// throws at roughly 85 mph (125 ft/s). With those, a routine groundout beats
// the batter by a step and a double play's relay to first is bang-bang.
const HOME_TO_FIRST_MS = 4300;
const LEG_MS = 3700;
const TRANSFER_MS = 450;
const THROW_FT_PER_MS = 0.125;
const legMs = (i: number, from: BaseCode) => (i === 0 && from === "home" ? HOME_TO_FIRST_MS : LEG_MS);

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

function runTime(from: BaseCode, path: [number, number][]): number {
  let t = 0;
  for (let i = 0; i < path.length - 1; i++) t += legMs(i, from);
  return t;
}

function along(from: BaseCode, path: [number, number][], ms: number): [number, number] {
  if (path.length < 2) return path[0];
  let t = ms;
  for (let i = 0; i < path.length - 1; i++) {
    const d = legMs(i, from);
    if (t <= d || i === path.length - 2) {
      const f = Math.min(1, t / d);
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      return [ax + (bx - ax) * f, ay + (by - ay) * f];
    }
    t -= d;
  }
  return path[path.length - 1];
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
  // Throw schedule: each throw leaves after a transfer and takes as long as
  // its distance at throwing speed, starting from where the ball was fielded.
  const throwPoints: [number, number][] = hit ? [[hit.x, hit.y], ...throws.map((b) => BASE_AT[b])] : [];
  const throwPlan: { start: number; end: number }[] = [];
  let clock = flightMs;
  for (let i = 0; i < throws.length; i++) {
    const [ax, ay] = throwPoints[i];
    const [bx, by] = throwPoints[i + 1];
    const start = clock + TRANSFER_MS;
    const end = start + Math.max(300, Math.hypot(bx - ax, by - ay) / THROW_FT_PER_MS);
    throwPlan.push({ start, end });
    clock = end;
  }
  const runMs = Math.max(0, ...runners.map((r) => runTime(r.from, legs(r.from, r.to))));
  const totalMs = Math.max(clock, runMs) + 400;

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

  // which throw is in the air (or about to leave), if any
  const throwLeg = throwPlan.findIndex((p) => elapsed < p.end);
  const inAir = throwLeg >= 0 && elapsed >= throwPlan[throwLeg].start ? throwLeg : -1;

  let ball: { x: number; y: number; height: number } | null = null;
  if (flying) {
    // grounders skip: a few shrinking hops instead of one arc
    const height = grounder ? Math.abs(Math.sin(t * Math.PI * 3)) * 6 * (1 - t) : 4 * apex * t * (1 - t);
    ball = { x: hit.x * t, y: hit.y * t, height };
  } else if (!done && inAir >= 0) {
    const p = throwPlan[inAir];
    const f = (elapsed - p.start) / (p.end - p.start);
    const [ax, ay] = throwPoints[inAir];
    const [bx, by] = throwPoints[inAir + 1];
    ball = { x: ax + (bx - ax) * f, y: ay + (by - ay) * f, height: 4 * 12 * f * (1 - f) };
  } else if (!done && throwLeg >= 0) {
    // in a fielder's glove during the transfer
    const [x, y] = throwPoints[throwLeg];
    ball = { x, y, height: 3 };
  }
  // throw lines drawn so far (the one in the air grows as it goes)
  const drawnThrows = done ? throws.length : throwPlan.filter((p) => elapsed >= p.start).length;
  const throwFrac = (i: number) => (done || elapsed >= throwPlan[i].end ? 1 : (elapsed - throwPlan[i].start) / (throwPlan[i].end - throwPlan[i].start));

  return (
    <g pointerEvents="none">
      {flying && <line x1={0} y1={0} x2={hit.x * t} y2={-hit.y * t} stroke="#fff" strokeOpacity={0.45} strokeWidth={2.5} strokeDasharray="6 6" />}
      {!flying && <circle cx={hit.x} cy={-hit.y} r={5} fill="#fff" stroke="#c81e1e" strokeWidth={1.2} />}
      {Array.from({ length: drawnThrows }, (_, i) => {
        const [ax, ay] = throwPoints[i];
        const [bx, by] = throwPoints[i + 1];
        const partial = throwFrac(i);
        return <line key={i} x1={ax} y1={-ay} x2={ax + (bx - ax) * partial} y2={-(ay + (by - ay) * partial)} stroke="#facc15" strokeWidth={3} strokeDasharray="8 6" />;
      })}
      {/* runners on the move (once the play is over the base lights show where they ended up) */}
      {!done &&
        runners.map((r, i) => {
          const path = legs(r.from, r.to);
          const [x, y] = along(r.from, path, elapsed);
          // out once the throw to their base lands (or on arrival for force
          // outs made without a throw)
          const k = throws.indexOf(r.to);
          const putOut = r.out && (k >= 0 ? elapsed >= throwPlan[k].end : elapsed >= runTime(r.from, path));
          return <circle key={i} cx={x} cy={-y} r={9} fill={putOut ? "#f87171" : "#facc15"} stroke="#1f2937" strokeWidth={2.5} />;
        })}
      {ball && <Ball {...ball} />}
      {done && throws.map((b) => <Tag key={b} x={BASE_AT[b][0]} y={BASE_AT[b][1]} text="OUT" color="#f87171" />)}
      {done && !throws.length && <circle cx={hit.x} cy={-hit.y} r={11} fill="none" stroke="#fff" strokeWidth={2} className="live-pulse" />}
      {done && !throws.length && <Tag x={hit.x} y={hit.y} text={hit.out ? `OUT · ${label}` : label} color={hit.out ? "#f87171" : "#fff"} />}
      {done && throws.length > 0 && label && <Tag x={hit.x} y={hit.y} text={label} />}
    </g>
  );
}
