import { useEffect, useRef, useState, type ReactNode } from "react";
import { FIELD_H, HASH_IN } from "./Field";
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

// ---------- football ----------

export interface FootballMotion {
  id: string;
  type: string;
  from: number; // yards from the home goal line
  to: number;
  towardHome: boolean;
  lane: "left" | "middle" | "right";
  depth?: "short" | "deep";
  formation?: "shotgun" | "pistol" | "under center";
  gap?: "end" | "tackle" | "guard" | "middle";
  scramble?: boolean;
  outOfBounds?: boolean;
  hash?: "top" | "middle" | "bottom";
  pass?: boolean;
  kickYards?: number;
  fumbleAt?: number;
  turnover?: boolean;
}

// A player's path: [ms, x, y] keyframes, standing still before the first and
// after the last.
type Key = [number, number, number];

function at(track: Key[], t: number): Pt {
  if (t <= track[0][0]) return [track[0][1], track[0][2]];
  for (let i = 1; i < track.length; i++) {
    const [t1, x1, y1] = track[i];
    if (t <= t1) {
      const [t0, x0, y0] = track[i - 1];
      const f = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
    }
  }
  const last = track[track.length - 1];
  return [last[1], last[2]];
}

// Keyframes along `pts` at a steady speed, leaving at `start`, `msPerYd` per yard.
function moving(start: number, pts: Pt[], msPerYd: number): Key[] {
  const out: Key[] = [[start, ...pts[0]]];
  let t = start;
  for (let i = 1; i < pts.length; i++) {
    t += Math.max(60, Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * msPerYd);
    out.push([t, ...pts[i]]);
  }
  return out;
}

const endTime = (track: Key[]) => track[track.length - 1][0];

// Arrive at the last point exactly at `end`, spread evenly over the path.
function arriving(start: number, end: number, pts: Pt[]): Key[] {
  const len = pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  return moving(start, pts, len > 0 ? (end - start) / len : 0);
}

interface Player {
  side: "off" | "def";
  track: Key[];
  from?: number; // appears at this time (an interceptor or punt returner)
  ballAt?: number; // runs with the ball from this time: the path after it is drawn heavier
  quiet?: boolean; // the QB: his drop isn't drawn, only a scramble or a sack
}

// The ball is either carried by a player or travelling on its own (a snap,
// a throw, a kick, a loose ball) — `arc` is its peak height in yards.
type BallPhase = { until: number } & ({ holder: number } | { from: Pt; to: Pt; start: number; arc: number; loose?: boolean });

interface FootballPlan {
  players: Player[];
  ball: BallPhase[];
  catchAt?: Pt;
  caughtAt?: number; // when the ball reaches catchAt
  dropped?: boolean;
  picked?: boolean;
  looseAt?: Pt;
}

const SIDELINE_IN = 1;

// Builds the play on the drawn field (away end zone left, so a spot sits at
// x = 110 - yardsFromHomeGoal) from what ESPN's play text calls: the
// formation sets where the QB takes the snap, a run goes through the named
// gap and then to the end spot, a pass is a route from a receiver split out
// on the called side to a catch short or deep (capped by the gain) and then
// the run after the catch. ESPN gives no player or catch locations, so those
// are placed the way the call reads; the start and end spots are real.
function footballPlan(m: FootballMotion): FootballPlan | null {
  const X = (yd: number) => 110 - yd;
  const d = m.towardHome ? 1 : -1; // +1 = offense moving right on screen
  const mid = FIELD_H / 2;
  // offense's left is the top of the screen when it's heading right
  const side = (m.lane === "left" ? -1 : m.lane === "right" ? 1 : 0) * d;
  const hy = mid + (m.hash === "top" ? -1 : m.hash === "bottom" ? 1 : 0) * (mid - HASH_IN);
  const los = X(m.from);
  const end = X(m.to);
  const t = m.type.toLowerCase();
  const clampY = (y: number) => Math.max(SIDELINE_IN, Math.min(FIELD_H - SIDELINE_IN, y));
  const sideline = (s: number) => (s < 0 ? SIDELINE_IN : FIELD_H - SIDELINE_IN);
  // where a carrier is brought down: drifting toward the called side, or
  // pushed out of bounds on it
  const downAt = (from: Pt, x: number, drift: number): Pt => [x, m.outOfBounds ? sideline(side || (from[1] < mid ? -1 : 1)) : clampY(from[1] + drift)];

  if (/field goal|punt|kickoff/.test(t)) {
    if (/field goal/.test(t)) {
      const hold: Pt = [los - 7 * d, hy];
      const wide = /missed|no good|blocked/.test(t) ? 7 : 0;
      return { players: [], ball: [{ from: [los, hy], to: hold, start: 0, until: 300, arc: 0.6 }, { from: hold, to: [m.towardHome ? 120 : 0, mid + wide], start: 600, until: 2200, arc: 14 }] };
    }
    const kicker: Pt = /punt/.test(t) ? [los - 14 * d, hy] : [los, mid];
    const land: Pt = [m.kickYards ? kicker[0] + m.kickYards * d : end, mid + (side || 0) * 8];
    const kick: BallPhase = { from: kicker, to: land, start: /punt/.test(t) ? 400 : 0, until: /punt/.test(t) ? 2600 : 2200, arc: 24 };
    const ball: BallPhase[] = /punt/.test(t) ? [{ from: [los, hy], to: kicker, start: 0, until: 400, arc: 1 }, kick] : [kick];
    // returned unless it went into the end zone or was fair caught where it fell
    const returned = Math.abs(land[0] - end) > 1 && land[0] > 0 && land[0] < 120;
    if (!returned) return { players: [], ball };
    const returner: Player = { side: "def", from: kick.until - 600, ballAt: kick.until, track: [[kick.until - 600, land[0], land[1]], ...moving(kick.until, [land, downAt(land, end, (mid - land[1]) * 0.4)], 90)] };
    return { players: [returner], ball: [...ball, { holder: 0, until: endTime(returner.track) }] };
  }

  const passPlay = /pass|interception|sack/.test(t) || (m.pass ?? false);
  const runPlay = /rush|scramble|two-point|kneel/.test(t);
  if (!passPlay && !runPlay && m.fumbleAt === undefined) return null;

  // the spot where the carrier's part of the play stops: the end spot, or
  // where the ball came loose
  const stop = m.fumbleAt !== undefined ? X(m.fumbleAt) : end;
  const gain = (stop - los) * d;
  const center: Pt = [los, hy];
  const gun = m.formation === "shotgun" ? 5 : m.formation === "pistol" ? 4 : 0;
  const qbStart: Pt = [los - Math.max(gun, 0.8) * d, hy];
  const snapMs = gun ? 300 : 0;
  const players: Player[] = [];
  const ball: BallPhase[] = [];
  if (gun) ball.push({ from: center, to: qbStart, start: 0, until: snapMs, arc: 0.4 });
  let looseFrom: Pt | undefined;

  const scramble = m.scramble || /scramble/.test(t);
  if (passPlay || scramble) {
    // drop back: seven steps for a deep shot, five otherwise; from the gun
    // it's a couple of yards
    const sack = /sack/.test(t);
    const loss = -gain;
    let depth = gun ? gun + 2 : m.depth === "deep" ? 7 : 5;
    if (sack) depth = Math.max(gun || 1, Math.min(depth, loss - 2)); // so he's driven back to the spot
    const dropTo: Pt = [los - depth * d, hy];
    const dropEnd = snapMs + (gun ? 400 : 800);
    const qb: Player = { side: "off", quiet: true, track: [[snapMs, ...qbStart], [dropEnd, ...dropTo]] };
    players.push(qb);

    if (sack || scramble) {
      // pressure: held in the pocket, then brought down (sack) or out of it
      // to the called side and upfield (scramble)
      const hold = dropEnd + 700;
      qb.ballAt = hold;
      const path: Pt[] = sack ? [dropTo, [stop, clampY(hy + side * 2)]] : [dropTo, [los - 3 * d, clampY(hy + (side || 1) * 9)], downAt([los, hy + (side || 1) * 9], stop, (side || 1) * 3)];
      qb.track.push(...moving(hold, path, sack ? 160 : 85).slice(1));
      ball.push({ holder: 0, until: endTime(qb.track) });
      if (sack) {
        // the rusher comes off the edge, gets to him and drives him down
        const edge = side || (hy > mid ? -1 : 1);
        const rusher: Player = { side: "def", track: [...arriving(0, hold, [[los + 1 * d, clampY(hy + edge * 4)], [dropTo[0] + 0.6 * d, dropTo[1] + edge * 1.4]]), ...qb.track.slice(-1).map(([k, x, y]): Key => [k, x + 0.6 * d, y + edge * 1.4])] };
        players.push(rusher);
      }
      looseFrom = path[path.length - 1];
    } else {
      // the route: split wide on the called side (in the slot when it went
      // over the middle), a stem upfield and the break to the catch
      const callDepth = m.depth === "deep" ? 24 : m.depth === "short" ? 6 : 11;
      const complete = /reception|touchdown/.test(t) || (m.fumbleAt !== undefined && !/interception/.test(t));
      const air = complete ? Math.max(-3, Math.min(callDepth, gain)) || 1 : callDepth;
      const s = side || (hy > mid ? -1 : 1); // middle routes come from the wide side of the field
      // inside the numbers (which sit 16½–19 yards off the middle), so the
      // lines don't run through them
      const align: Pt = [los - 0.5 * d, clampY(mid + s * (side ? 14.5 : 7))];
      const catchAt: Pt = [los + air * d, clampY(mid + (side ? s * (m.depth === "deep" ? 15 : 12) : (hy - mid) * 0.5))];
      const route: Pt[] =
        air < 1 ? [align, [los - 1 * d, align[1]], catchAt] // screen: settle and come back for it
        : m.depth === "deep" ? [align, [los + Math.min(6, air / 3) * d, align[1]], catchAt]
        : [align, [catchAt[0] - (side ? 0 : 3) * d, align[1]], catchAt];
      const throwAt = dropEnd + (m.depth === "deep" ? 500 : 250);
      const flight = 350 + Math.abs(catchAt[0] - dropTo[0]) * 28;
      const caught = throwAt + flight;
      const rec: Player = { side: "off", track: arriving(0, caught, route) };
      players.push(rec);
      ball.push({ holder: 0, until: throwAt }, { from: dropTo, to: catchAt, start: throwAt, until: caught, arc: 2 + Math.abs(air) * 0.4 });
      if (/interception/.test(t)) {
        const def: Player = { side: "def", from: caught - 500, ballAt: caught, track: [[caught - 500, catchAt[0] + 2 * d, catchAt[1] + 2], [caught, ...catchAt]] };
        def.track.push(...moving(caught, [catchAt, [end, clampY(catchAt[1] + (mid - catchAt[1]) * 0.5)]], 90).slice(1));
        players.push(def);
        ball.push({ holder: 2, until: endTime(def.track) });
        return { players, ball, catchAt, caughtAt: caught, picked: true };
      }
      if (!complete) {
        ball.push({ from: catchAt, to: [catchAt[0] + 1.5 * d, catchAt[1]], start: caught, until: caught + 300, arc: 0.4 });
        return { players, ball, catchAt, caughtAt: caught, dropped: true };
      }
      rec.ballAt = caught;
      const tackled = downAt(catchAt, stop, (mid - catchAt[1]) * 0.25);
      if (Math.abs(tackled[0] - catchAt[0]) > 0.5 || m.outOfBounds) rec.track.push(...moving(caught, [catchAt, tackled], 85).slice(1));
      ball.push({ holder: 1, until: endTime(rec.track) });
      looseFrom = tackled;
      if (m.fumbleAt === undefined) return { players, ball, catchAt, caughtAt: caught };
      return withFumble({ players, ball, catchAt, caughtAt: caught }, looseFrom, end, mid);
    }
  } else {
    // a handoff: the back meets the QB, hits the called gap and runs to the spot
    const gapOff = { middle: 0, guard: 1.5, tackle: 3.5, end: 7 }[m.gap ?? "middle"] * (side || 0);
    const qb: Player = { side: "off", quiet: true, track: [[snapMs, ...qbStart], [snapMs + 350, qbStart[0] - 1 * d, hy - gapOff * 0.1]] };
    const back: Pt = gun ? [qbStart[0], hy - (side || 1) * 1.5] : [los - 7 * d, hy];
    const mesh: Pt = [los - 3.5 * d, hy + gapOff * 0.3];
    const meshAt = snapMs + 600;
    const hole: Pt = [los, clampY(hy + gapOff)];
    const tackled = downAt(hole, stop, (side || 0) * 2);
    const path: Pt[] = gain > 0 ? [mesh, hole, tackled] : [mesh, tackled];
    const rb: Player = { side: "off", ballAt: meshAt, track: [[0, ...back], [meshAt, ...mesh], ...moving(meshAt, path, 85).slice(1)] };
    players.push(qb, rb);
    ball.push({ holder: 0, until: meshAt }, { holder: 1, until: endTime(rb.track) });
    looseFrom = tackled;
  }
  const plan: FootballPlan = { players, ball };
  return m.fumbleAt !== undefined && looseFrom ? withFumble(plan, looseFrom, end, mid) : plan;
}

// The ball squirts loose where the carrier stopped and is recovered at the end spot.
function withFumble(plan: FootballPlan, loose: Pt, end: number, mid: number): FootballPlan {
  const start = plan.ball[plan.ball.length - 1].until;
  plan.ball.push({ from: loose, to: [end, loose[1] + (mid - loose[1]) * 0.3], start, until: start + 1300, arc: 0, loose: true });
  return { ...plan, looseAt: loose };
}

function ballAt(plan: FootballPlan, t: number): { at: Pt; height: number; loose: boolean; f: number } {
  const ph = plan.ball.find((p) => t < p.until) ?? plan.ball[plan.ball.length - 1];
  if ("holder" in ph) return { at: at(plan.players[ph.holder].track, t), height: 0, loose: false, f: 1 };
  const f = Math.max(0, Math.min(1, (t - ph.start) / (ph.until - ph.start || 1)));
  const height = ph.loose ? Math.abs(Math.sin(f * Math.PI * 4)) * 1.6 * (1 - f) : 4 * ph.arc * f * (1 - f);
  return { at: [ph.from[0] + (ph.to[0] - ph.from[0]) * f, ph.from[1] + (ph.to[1] - ph.from[1]) * f], height, loose: Boolean(ph.loose), f };
}

// A track's path up to time `t` (the whole of it when t is Infinity).
function pathTo(track: Key[], t: number, from = -Infinity): Pt[] {
  const pts: Pt[] = [at(track, Math.max(from, track[0][0]))];
  for (const k of track) if (k[0] > from && k[0] < t) pts.push([k[1], k[2]]);
  if (t !== Infinity) pts.push(at(track, t));
  else pts.push(at(track, endTime(track)));
  return pts;
}

const poly = (pts: Pt[]) => pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");

function Arrow({ pts, color }: { pts: Pt[]; color: string }) {
  const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
  if (!a || Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3) return null;
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return <path d="M0 0 l-1.4 -0.8 l0 1.6 z" fill={color} transform={`translate(${b[0]} ${b[1]}) rotate(${ang})`} />;
}

const FADE_MS = 500;
const DIAGRAM_OPACITY = 0.55;

// The play drawn like a playbook diagram as it happens: players as dots in
// their team's colour, routes as thin lines, the ball carrier's path heavier
// with an arrow where they went down, throws and kicks dashed. When the
// play ends the players fade out and the diagram stays, dimmed, until the
// next play; `rest` (the ball spotted for the next snap) fades in.
export function FootballPlay({ motion, rest, offense, defense }: { motion: FootballMotion | undefined; rest?: ReactNode; offense: string; defense: string }) {
  const plan = motion ? footballPlan(motion) : null;
  const playMs = plan ? Math.max(...plan.ball.map((p) => p.until), ...plan.players.map((p) => endTime(p.track))) : 0;
  const elapsed = usePlayClock(motion?.id, playMs + FADE_MS);
  const idle = elapsed === Infinity;
  const restingBall = idle && rest ? (
    <g key={motion?.id ?? "rest"} className="lv-fade-in">
      {rest}
    </g>
  ) : null;
  if (!motion || !plan) return restingBall;
  const now = idle ? Infinity : Math.min(elapsed, playMs);
  const fading = !idle && elapsed >= playMs;
  const actorOpacity = fading ? Math.max(0, 1 - (elapsed - playMs) / FADE_MS) : 1;
  const ball = idle ? null : ballAt(plan, now);
  const colorOf = (p: Player) => (p.side === "off" ? offense : defense);
  const visible = (p: Player) => p.from === undefined || now >= p.from;
  const throws = plan.ball.filter((p): p is Extract<BallPhase, { from: Pt }> => "from" in p && !p.loose && p.arc > 1 && now > p.start);
  return (
    <g pointerEvents="none">
      <g opacity={idle ? DIAGRAM_OPACITY : 1} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {throws.map((p, i) => {
          const f = Math.min(1, (now - p.start) / (p.until - p.start));
          return <line key={`t${i}`} x1={p.from[0]} y1={p.from[1]} x2={p.from[0] + (p.to[0] - p.from[0]) * f} y2={p.from[1] + (p.to[1] - p.from[1]) * f} stroke="#fff" strokeWidth={0.3} strokeDasharray="0.9 0.7" />;
        })}
        {plan.players.map((p, i) => {
          if (!visible(p)) return null;
          const until = Math.min(now, endTime(p.track));
          const route = pathTo(p.track, p.ballAt !== undefined ? Math.min(until, p.ballAt) : until);
          const carry = p.ballAt !== undefined && now > p.ballAt ? pathTo(p.track, until, p.ballAt) : null;
          return (
            <g key={i}>
              {!p.quiet && route.length > 1 && <polyline points={poly(route)} stroke="#fff" strokeOpacity={0.8} strokeWidth={0.22} />}
              {carry && carry.length > 1 && (
                <g>
                  <polyline points={poly(carry)} stroke={colorOf(p)} strokeWidth={0.75} />
                  <polyline points={poly(carry)} stroke="#fff" strokeWidth={0.25} />
                  {now === Infinity || now >= endTime(p.track) ? <Arrow pts={carry} color="#fff" /> : null}
                </g>
              )}
            </g>
          );
        })}
        {plan.catchAt && now >= (plan.caughtAt ?? 0) && (plan.dropped || plan.picked) && (
          <g stroke="#f87171" strokeWidth={0.35}>
            {plan.dropped ? (
              <path d={`M${plan.catchAt[0] - 0.8} ${plan.catchAt[1] - 0.8} l1.6 1.6 m0 -1.6 l-1.6 1.6`} />
            ) : (
              <circle cx={plan.catchAt[0]} cy={plan.catchAt[1]} r={1} />
            )}
          </g>
        )}
        {plan.looseAt && (idle || (ball?.loose ?? false)) && (
          <text x={plan.looseAt[0]} y={plan.looseAt[1] - 2.2} fontSize={1.8} fontWeight={900} fill="#f87171" textAnchor="middle" stroke="#1f2937" strokeWidth={0.4} paintOrder="stroke">
            FUMBLE
          </text>
        )}
      </g>
      {restingBall}
      {!idle && (
        <g opacity={actorOpacity}>
          {plan.players.map((p, i) => {
            if (!visible(p)) return null;
            const [x, y] = at(p.track, now);
            return <circle key={i} cx={x} cy={y} r={0.95} fill={colorOf(p)} stroke="#fff" strokeWidth={0.22} />;
          })}
          {ball && (
            <g>
              {ball.height > 0.2 && <ellipse cx={ball.at[0] + ball.height * 0.12} cy={ball.at[1] + ball.height * 0.22} rx={0.9} ry={0.5} fill="#000" fillOpacity={Math.max(0.12, 0.38 - ball.height * 0.012)} />}
              <g transform={`translate(${ball.at[0]} ${ball.at[1]}) rotate(${ball.loose ? ball.f * 720 : 0}) scale(${(ball.height > 0.2 ? 1 : 0.75) + ball.height * 0.045})`}>
                <ellipse rx={1.1} ry={0.65} fill="#8a4a22" stroke={motion.turnover && ball.loose && ball.f > 0.6 ? "#f87171" : "#fff"} strokeWidth={0.18} />
                <line x1={-0.5} x2={0.5} y1={0} y2={0} stroke="#fff" strokeWidth={0.13} />
              </g>
            </g>
          )}
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
