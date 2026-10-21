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
  pass?: boolean;
  kickYards?: number;
  fumbleAt?: number;
  turnover?: boolean;
}

type FSeg = Seg & { loose?: boolean };

// Builds the ball's path for a football play on the drawn field (away end
// zone left, so a spot sits at x = 110 - yardsFromHomeGoal). ESPN gives no
// catch location: a pass is thrown from behind the line to a point short or
// deep in the named lane (capped by where the play ended), then carried to
// the real end spot. Punts land where "punts N yards" puts them and are run
// back; interceptions are thrown, picked and returned; fumbles squirt loose
// where the gain before "FUMBLES" ended and are recovered at the end spot.
function footballSegments(m: FootballMotion): { segs: FSeg[]; catchAt?: Pt; dropped?: boolean; looseAt?: Pt } {
  const X = (yd: number) => 110 - yd;
  const dir = m.towardHome ? 1 : -1; // +1 = offense moving right on screen
  const mid = FIELD_H / 2;
  const laneOff = (m.lane === "left" ? -1 : m.lane === "right" ? 1 : 0) * 13 * dir;
  const los = X(m.from);
  const end = X(m.to);
  const yds = (n: number) => Math.min(2800, Math.max(450, Math.abs(n) * 80));
  const run = (from: Pt, to: Pt): FSeg => ({ from, to, ms: yds(to[0] - from[0]), arc: 0, kind: "ground" });
  const t = m.type.toLowerCase();

  const pass = (gainTo: number): { segs: FSeg[]; catchAt: Pt } => {
    const depth = m.depth === "deep" ? 22 : m.depth === "short" ? 7 : 11;
    const airYds = Math.max(2, Math.min(depth, (gainTo - los) * dir || depth));
    const catchAt: Pt = [los + airYds * dir, mid + laneOff];
    return { segs: [{ from: [los - 6 * dir, mid], to: catchAt, ms: 500 + airYds * 35, arc: 3 + airYds * 0.35, kind: "air" }], catchAt };
  };

  if (m.fumbleAt !== undefined) {
    // carry (or catch and carry) to where it came loose, then the loose ball
    const loose: Pt = [X(m.fumbleAt), mid + laneOff * 0.6];
    const lead = m.pass ? pass(loose[0]) : { segs: [] as FSeg[], catchAt: undefined };
    const carryFrom: Pt = lead.catchAt ?? [los - (/sack/.test(t) ? 6 : 3) * dir, mid];
    const recovered: Pt = [end, mid + laneOff * 0.4];
    return {
      segs: [...lead.segs, run(carryFrom, loose), { from: loose, to: recovered, ms: 1300, arc: 0, kind: "ground", loose: true }],
      catchAt: lead.catchAt,
      looseAt: loose,
    };
  }
  if (/interception/.test(t)) {
    const { segs, catchAt } = pass(los + 15 * dir);
    return { segs: [...segs, run(catchAt, [end, mid + laneOff * 0.5])], catchAt };
  }
  if (/pass reception|passing touchdown|incompletion/.test(t)) {
    const { segs, catchAt } = pass(end);
    if (/incompletion/.test(t)) return { segs, catchAt, dropped: true };
    return { segs: [...segs, run(catchAt, [end, mid + laneOff * 0.6])], catchAt };
  }
  if (/sack/.test(t)) return { segs: [run([los - 6 * dir, mid], [end, mid])] };
  if (/rush|scramble|two-point|kneel/.test(t)) return { segs: [run([los - 3 * dir, mid], [end, mid + laneOff * 0.7])] };
  if (/field goal/.test(t)) {
    const posts = m.towardHome ? 120 : 0;
    const wide = /missed|no good/.test(t) ? 7 : 0;
    return { segs: [{ from: [los - 7 * dir, mid], to: [posts, mid + wide], ms: 1600, arc: 14, kind: "air" }] };
  }
  if (/punt/.test(t)) {
    const punter: Pt = [los - 13 * dir, mid];
    const land: Pt = [m.kickYards ? los + m.kickYards * dir : end, mid];
    const segs: FSeg[] = [{ from: punter, to: land, ms: 2200, arc: 24, kind: "air" }];
    if (Math.abs(land[0] - end) > 1) segs.push(run(land, [end, mid]));
    return { segs };
  }
  if (/kickoff/.test(t)) return { segs: [{ from: [los, mid], to: [end, mid], ms: 2200, arc: 24, kind: "air" }] };
  return { segs: [] };
}

const FADE_MS = 500;

// `rest` is the ball sitting at the line of scrimmage for the next snap. It's
// hidden while a play runs; when the play ends the moving ball fades out
// where the play finished and the resting ball fades back in on the line.
// Height is shown top-down: the ball stays on its path and grows, while its
// shadow drops away from it — no sideways jump that would read as a bounce.
export function FootballPlay({ motion, rest }: { motion: FootballMotion | undefined; rest?: ReactNode }) {
  const plan = motion ? footballSegments(motion) : { segs: [] as FSeg[] };
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
  const firstAir = plan.segs.find((sg) => sg.kind === "air");
  const airIdx = firstAir ? plan.segs.indexOf(firstAir) : -1;
  const showTrail = firstAir && (!pos || pos.seg > airIdx || (pos.seg === airIdx && pos.f > 0));
  // a loose ball hops: small shrinking bounces on its way to the recovery
  const looseSeg = pos ? (plan.segs[pos.seg] as FSeg) : undefined;
  const height = pos ? (looseSeg?.loose ? Math.abs(Math.sin(pos.f * Math.PI * 4)) * 1.6 * (1 - pos.f) : pos.height) : 0;
  const spin = looseSeg?.loose && pos ? pos.f * 720 : 0;
  const turnoverShown = motion.turnover && pos && looseSeg?.loose && pos.f > 0.6;
  return (
    <g pointerEvents="none">
      {showTrail && firstAir && (
        <line
          x1={firstAir.from[0]}
          y1={firstAir.from[1]}
          x2={pos && pos.seg === airIdx ? pos.at[0] : firstAir.to[0]}
          y2={pos && pos.seg === airIdx ? pos.at[1] : firstAir.to[1]}
          stroke="#fff"
          strokeOpacity={pos ? 0.7 : 0.35}
          strokeWidth={0.3}
          strokeDasharray="1 0.8"
        />
      )}
      {plan.catchAt && (!pos || pos.seg > airIdx) && (
        <circle cx={plan.catchAt[0]} cy={plan.catchAt[1]} r={0.9} fill="none" stroke={plan.dropped ? "#f87171" : /interception/i.test(motion.type) ? "#f87171" : "#fff"} strokeWidth={0.3} />
      )}
      {plan.looseAt && (!pos || (looseSeg?.loose ?? false)) && (
        <text x={plan.looseAt[0]} y={plan.looseAt[1] - 2.2} fontSize={1.8} fontWeight={900} fill="#f87171" textAnchor="middle" stroke="#1f2937" strokeWidth={0.4} paintOrder="stroke">
          FUMBLE
        </text>
      )}
      {restingBall}
      {pos && (
        <g opacity={fadeOpacity}>
          <ellipse
            cx={pos.at[0] + height * 0.12}
            cy={pos.at[1] + height * 0.22}
            rx={1.2}
            ry={0.7}
            fill="#000"
            fillOpacity={Math.max(0.12, 0.38 - height * 0.012)}
          />
          <g transform={`translate(${pos.at[0]} ${pos.at[1]}) rotate(${spin}) scale(${1 + height * 0.045})`}>
            <ellipse rx={1.3} ry={0.8} fill="#8a4a22" stroke={turnoverShown ? "#f87171" : "#fff"} strokeWidth={turnoverShown ? 0.3 : 0.15} />
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
