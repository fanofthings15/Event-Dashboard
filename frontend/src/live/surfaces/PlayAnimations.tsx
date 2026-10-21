import { useEffect, useRef, useState, type ReactNode } from "react";
import { FIELD_H } from "./Field";
import { RIM_X, COURT_W } from "./Court";

// Milliseconds since the play with `id` started animating, or Infinity when
// idle. The play that's already latest when a view opens isn't replayed —
// only new ones animate.
export function usePlayClock(id: string | undefined, totalMs: number): number {
  const first = useRef<string | undefined>(id);
  const [elapsed, setElapsed] = useState(Infinity);
  useEffect(() => {
    if (!id || id === first.current) return;
    first.current = undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const e = now - start;
      if (e >= totalMs) return setElapsed(Infinity);
      setElapsed(e);
      raf = requestAnimationFrame(step);
    };
    setElapsed(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [id]);
  return elapsed;
}

type Pt = [number, number];
interface Seg {
  from: Pt;
  to: Pt;
  ms: number;
  arc: number; // peak height of the ball above the ground, in the surface's units
  kind: "air" | "ground";
}

// Where along a chain of segments the ball is at `elapsed`.
function position(segs: Seg[], elapsed: number): { at: Pt; height: number; seg: number; f: number } | null {
  let t = elapsed;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (t <= s.ms) {
      const f = t / s.ms;
      return { at: [s.from[0] + (s.to[0] - s.from[0]) * f, s.from[1] + (s.to[1] - s.from[1]) * f], height: 4 * s.arc * f * (1 - f), seg: i, f };
    }
    t -= s.ms;
  }
  return null;
}

const total = (segs: Seg[]) => segs.reduce((n, s) => n + s.ms, 0) + 250;

// ---------- football ----------

export interface FootballMotion {
  id: string;
  type: string;
  from: number; // yards from the home goal line
  to: number;
  towardHome: boolean;
  lane: "left" | "middle" | "right";
  depth?: "short" | "deep";
}

// Builds the ball's path for a football play on the drawn field (away end
// zone left, so a spot sits at x = 110 - yardsFromHomeGoal). ESPN gives no
// catch location: a pass is thrown from behind the line to a point short or
// deep in the named lane (capped by where the play ended), then carried to
// the real end spot.
function footballSegments(m: FootballMotion): { segs: Seg[]; catchAt?: Pt; dropped?: boolean } {
  const X = (yd: number) => 110 - yd;
  const dir = m.towardHome ? 1 : -1; // +1 = offense moving right on screen
  const mid = FIELD_H / 2;
  const laneOff = (m.lane === "left" ? -1 : m.lane === "right" ? 1 : 0) * 13 * dir;
  const los = X(m.from);
  const end = X(m.to);
  const gain = (end - los) * dir;
  const yds = (n: number) => Math.min(2600, Math.max(500, Math.abs(n) * 75));
  const t = m.type.toLowerCase();

  if (/pass reception|passing touchdown|interception|incompletion/.test(t)) {
    const depth = m.depth === "deep" ? 22 : m.depth === "short" ? 7 : 11;
    const airYds = /incompletion|interception/.test(t) ? depth : Math.max(2, Math.min(depth, gain));
    const qb: Pt = [los - 6 * dir, mid];
    const catchAt: Pt = [los + airYds * dir, mid + laneOff];
    const throwSeg: Seg = { from: qb, to: catchAt, ms: 500 + airYds * 35, arc: 3 + airYds * 0.35, kind: "air" };
    if (/incompletion/.test(t)) return { segs: [throwSeg], catchAt, dropped: true };
    const runTo: Pt = [end, mid + laneOff * 0.6];
    return { segs: [throwSeg, { from: catchAt, to: runTo, ms: yds(Math.abs(end - catchAt[0])), arc: 0, kind: "ground" }], catchAt };
  }
  if (/sack/.test(t)) return { segs: [{ from: [los - 6 * dir, mid], to: [end, mid], ms: 900, arc: 0, kind: "ground" }] };
  if (/rush|scramble|two-point|kneel/.test(t)) {
    return { segs: [{ from: [los - 3 * dir, mid], to: [end, mid + laneOff * 0.7], ms: yds(gain), arc: 0, kind: "ground" }] };
  }
  if (/field goal/.test(t)) {
    const posts = m.towardHome ? 120 : 0;
    const wide = /missed|no good/.test(t) ? 7 : 0;
    return { segs: [{ from: [los - 7 * dir, mid], to: [posts, mid + wide], ms: 1600, arc: 14, kind: "air" }] };
  }
  if (/punt|kickoff/.test(t)) {
    const kickFrom = /punt/.test(t) ? los - 13 * dir : los;
    return { segs: [{ from: [kickFrom, mid], to: [end, mid], ms: 2000, arc: 22, kind: "air" }] };
  }
  return { segs: [] };
}

const FADE_MS = 500;

// `rest` is the ball sitting at the line of scrimmage for the next snap. It's
// hidden while a play runs; when the play ends the moving ball fades out
// where the play finished and the resting ball fades back in on the line.
export function FootballPlay({ motion, rest }: { motion: FootballMotion | undefined; rest?: ReactNode }) {
  const plan = motion ? footballSegments(motion) : { segs: [] as Seg[] };
  const playMs = total(plan.segs) - 250;
  const elapsed = usePlayClock(motion?.id, playMs + FADE_MS);
  const idle = elapsed === Infinity;
  const restingBall = idle && rest ? (
    <g key={motion?.id ?? "rest"} className="lv-fade-in">
      {rest}
    </g>
  ) : null;
  if (!motion || plan.segs.length === 0) return restingBall;
  const fading = !idle && elapsed >= playMs;
  const pos = idle ? null : fading ? position(plan.segs, playMs - 1) : position(plan.segs, elapsed);
  const fadeOpacity = fading ? Math.max(0, 1 - (elapsed - playMs) / FADE_MS) : 1;
  const throwSeg = plan.segs[0].kind === "air" ? plan.segs[0] : undefined;
  const showTrail = throwSeg && (!pos || pos.seg > 0 || pos.f > 0);
  return (
    <g pointerEvents="none">
      {/* the throw or kick, drawn as it goes and left faintly afterwards */}
      {showTrail && throwSeg && (
        <line
          x1={throwSeg.from[0]}
          y1={throwSeg.from[1]}
          x2={pos && pos.seg === 0 ? pos.at[0] : throwSeg.to[0]}
          y2={pos && pos.seg === 0 ? pos.at[1] : throwSeg.to[1]}
          stroke="#fff"
          strokeOpacity={pos ? 0.7 : 0.35}
          strokeWidth={0.3}
          strokeDasharray="1 0.8"
        />
      )}
      {plan.catchAt && (!pos || pos.seg > 0) && (
        <circle cx={plan.catchAt[0]} cy={plan.catchAt[1]} r={0.9} fill="none" stroke={plan.dropped ? "#f87171" : "#fff"} strokeWidth={0.3} />
      )}
      {restingBall}
      {pos && (
        <g opacity={fadeOpacity}>
          <ellipse cx={pos.at[0]} cy={pos.at[1]} rx={1.1 + pos.height * 0.03} ry={0.6 + pos.height * 0.02} fill="#000" fillOpacity={0.35} />
          <g transform={`translate(${pos.at[0]} ${pos.at[1] - pos.height * 0.35}) scale(${1 + pos.height * 0.05})`}>
            <ellipse rx={1.3} ry={0.8} fill="#8a4a22" stroke="#fff" strokeWidth={0.15} />
            <line x1={-0.6} x2={0.6} y1={0} y2={0} stroke="#fff" strokeWidth={0.15} />
          </g>
        </g>
      )}
    </g>
  );
}

// ---------- hockey ----------

// The puck's trip from the shot spot (already in rink drawing coordinates)
// to the net it was aimed at: into the net on a goal, stopped at the crease
// on a save, cut off short when blocked, past the post when it missed.
export function HockeyShotPlay({ shot }: { shot: { id: string; at: Pt; goal: boolean; blocked: boolean; missed: boolean } | undefined }) {
  const elapsed = usePlayClock(shot?.id, 900);
  if (!shot || elapsed === Infinity) return null;
  const [x, y] = shot.at;
  const netX = x < 100 ? 11 : 189;
  const inward = netX === 11 ? -1 : 1; // toward the back of the net
  let to: Pt = [netX + inward * 2, 42.5];
  if (shot.missed) to = [netX + inward * 3, 42.5 + (y < 42.5 ? -6 : 6)];
  else if (shot.blocked) to = [x + (netX - x) * 0.35, y + (42.5 - y) * 0.35];
  else if (!shot.goal) to = [netX - inward * 4, 42.5 + (y - 42.5) * 0.1];
  const f = Math.min(1, elapsed / 550);
  const px = x + (to[0] - x) * f;
  const py = y + (to[1] - y) * f;
  return (
    <g pointerEvents="none">
      <line x1={x} y1={y} x2={px} y2={py} stroke="#111" strokeOpacity={0.4} strokeWidth={0.5} strokeDasharray="1.2 1" />
      <ellipse cx={px} cy={py} rx={1.6} ry={1.1} fill="#111" stroke="#fff" strokeWidth={0.3} />
    </g>
  );
}

// ---------- basketball ----------

// The latest shot's arc from where it was taken to the rim it was aimed at
// (court drawing coordinates, feet): through the net on a make, off the rim
// on a miss. The ball grows with height so the arc reads top-down.
export function BasketballShotPlay({ shot }: { shot: { id: string; at: Pt; rimLeft: boolean; made: boolean } | undefined }) {
  const elapsed = usePlayClock(shot?.id, 1500);
  if (!shot || elapsed === Infinity) return null;
  const rim: Pt = [shot.rimLeft ? RIM_X : COURT_W - RIM_X, 25];
  const [x, y] = shot.at;
  const dist = Math.hypot(rim[0] - x, rim[1] - y);
  const flight = 650 + dist * 14;
  const apex = 4 + dist * 0.25;
  let at: Pt;
  let h = 0;
  if (elapsed < flight) {
    const f = elapsed / flight;
    at = [x + (rim[0] - x) * f, y + (rim[1] - y) * f];
    h = 4 * apex * f * (1 - f);
  } else {
    const f = Math.min(1, (elapsed - flight) / 500);
    if (shot.made) {
      at = rim;
      h = -f * 2; // drops through
    } else {
      // off the rim, back out the way it came
      const ux = (x - rim[0]) / (dist || 1);
      const uy = (y - rim[1]) / (dist || 1);
      at = [rim[0] + ux * 5 * f + uy * 2 * f, rim[1] + uy * 5 * f - ux * 2 * f];
      h = 4 * 2.5 * f * (1 - f);
    }
  }
  const r = Math.max(0.35, 0.8 + h * 0.06);
  return (
    <g pointerEvents="none">
      <ellipse cx={at[0]} cy={at[1]} rx={0.7} ry={0.45} fill="#000" fillOpacity={0.3} />
      <circle cx={at[0]} cy={at[1] - h * 0.25} r={r} fill="#f97316" stroke="#7c2d12" strokeWidth={0.15} opacity={shot.made && elapsed > flight ? 1 - Math.min(1, (elapsed - flight) / 500) : 1} />
      {shot.made && elapsed > flight && <circle cx={rim[0]} cy={rim[1]} r={1.5 + (elapsed - flight) / 150} fill="none" stroke="#fff" strokeOpacity={Math.max(0, 1 - (elapsed - flight) / 500)} strokeWidth={0.25} />}
    </g>
  );
}
