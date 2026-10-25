import { useCallback, useEffect, useMemo, useRef } from "react";
import type { F1State } from "../liveTypes";
import { C, LiveFrame, Message, Side, Surface } from "../Layout";

// TrackStatus codes from the live-timing feed. 1 (all clear) gets no pill.
const TYRE: Record<string, { letter: string; color: string }> = {
  SOFT: { letter: "S", color: "#ef4444" },
  MEDIUM: { letter: "M", color: "#facc15" },
  HARD: { letter: "H", color: "#e8eaed" },
  INTERMEDIATE: { letter: "I", color: "#22c55e" },
  WET: { letter: "W", color: "#3b82f6" },
};
const tyre = (c?: string) => (c ? TYRE[c.toUpperCase()] : undefined);

const TRACK_STATUS: Record<string, { label: string; color: string; ink: string }> = {
  "2": { label: "Yellow flag", color: C.yellow, ink: "#1a1600" },
  "4": { label: "Safety car", color: "#f97316", ink: "#1a0d00" },
  "5": { label: "Red flag", color: C.live, ink: "#fff" },
  "6": { label: "Virtual safety car", color: "#f97316", ink: "#1a0d00" },
  "7": { label: "VSC ending", color: "#f97316", ink: "#1a0d00" },
};

// The real circuit outline (MultiViewer, F1's own coordinates, y-up) with
// its per-circuit rotation, normalised into a 1000-unit box. Marshal
// sectors run from each sector's start point to the next one's, located by
// the nearest outline point.
function useTrackGeometry(circuit: F1State["circuit"]) {
  return useMemo(() => {
    if (!circuit || circuit.x.length < 2) return null;
    const a = (circuit.rotation * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const rot = (x: number, y: number): [number, number] => [x * cos - y * sin, -(x * sin + y * cos)];
    const raw = circuit.x.map((x, i) => rot(x, circuit.y[i]));
    const xs = raw.map((p) => p[0]);
    const ys = raw.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const scale = 1000 / Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
    const toView = (x: number, y: number): [number, number] => {
      const [rx, ry] = rot(x, y);
      return [(rx - minX) * scale, (ry - minY) * scale];
    };
    const pts = circuit.x.map((x, i) => toView(x, circuit.y[i]));
    const w = (Math.max(...xs) - minX) * scale;
    const h = (Math.max(...ys) - minY) * scale;
    const path = (seg: [number, number][]) => "M" + seg.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L");

    const starts = [...circuit.marshalSectors]
      .sort((p, q) => p.number - q.number)
      .map((s) => {
        let best = 0;
        let bestD = Infinity;
        circuit.x.forEach((x, i) => {
          const d = (x - s.x) ** 2 + (circuit.y[i] - s.y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        return { number: s.number, index: best };
      });
    const sectors = starts.map((s, k) => {
      const end = starts[(k + 1) % starts.length].index;
      const seg: [number, number][] = [];
      for (let i = s.index; ; i = (i + 1) % pts.length) {
        seg.push(pts[i]);
        if (i === end || seg.length > pts.length) break;
      }
      return { number: s.number, d: path(seg) };
    });
    // Pit lane: no feed gives its shape, so it's drawn alongside the stretch
    // of track either side of the start/finish line (where the outline
    // starts), offset to the outside of the circuit with entry and exit
    // connectors back to the track.
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const k = Math.max(3, Math.round(pts.length * 0.045));
    const at = (i: number) => pts[(i + pts.length) % pts.length];
    const lane: [number, number][] = [];
    for (let i = -k; i <= k; i++) {
      const [x, y] = at(i);
      const [ax, ay] = at(i - 1);
      const [bx, by] = at(i + 1);
      let nx = -(by - ay);
      let ny = bx - ax;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      if ((x - cx) * nx + (y - cy) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      lane.push([x + nx * 34, y + ny * 34]);
    }
    const pit = {
      d: path(lane),
      entry: path([at(-k - 3), lane[0]]),
      exit: path([lane[lane.length - 1], at(k + 3)]),
      points: lane,
    };
    return { toView, outline: path(pts) + " Z", sectors, start: pts[0], w, h, pit };
  }, [circuit]);
}

// F1 doesn't send car x/y to anonymous viewers, so the backend places each
// car by the mini-sectors it has completed this lap (see f1Live.ts), as an
// outline index; the outline is sampled at a steady rate round a lap, so
// index runs with time and a car's pace is points-per-second from its last
// lap. Mini-sector marks arrive in bursts, so in a race only the leader is
// placed that way and everyone else sits their official time gap behind:
// the order and spacing then match the timing tower. Lapped cars, and every
// car in practice or qualifying (where the gap is to the fastest lap), use
// their own mini-sectors.
type Driver = F1State["drivers"][number];

function estimateTargets(data: F1State, now: number, receivedAt: number): Map<string, { at: number; perSec: number }> {
  const out = new Map<string, { at: number; perSec: number }>();
  // where the timing puts the car, run on at its pace for as long as the
  // next mark is overdue (they come late, not early) — up to one more
  // mini-sector beyond the one it's in
  const own = (t: NonNullable<Driver["track"]>) =>
    t.from + Math.min(2 * Math.max(0, t.to - t.from), ((t.ageMs + Math.max(0, now - receivedAt)) / 1000) * t.perSec);
  const name = data.session?.name ?? "";
  const race = /race|sprint/i.test(name) && !/qualifying|shootout/i.test(name);
  const leader = data.drivers.find((d) => d.position === 1 && d.track && !d.inPit && !d.out);
  const leaderAt = race && leader?.track ? own(leader.track) : undefined;
  for (const d of data.drivers) {
    const t = d.track;
    if (!t || d.inPit || d.out) continue;
    const gap = d === leader ? 0 : Number(d.gap?.match(/^\+?(\d+(?:\.\d+)?)$/)?.[1]);
    out.set(d.number, { at: leaderAt !== undefined && Number.isFinite(gap) ? leaderAt - gap * t.perSec : own(t), perSec: t.perSec });
  }
  return out;
}

// Each car drives on smoothly at its own pace every frame and is steered
// toward where the timing says it is (half the difference closed per
// second), instead of jumping on every update. It never reverses: a car
// ahead of its estimate eases off to no less than 30% pace. A big miss (out
// of the pits, a tab coming back from the background) snaps straight there.
const STEER = 0.5;
const MIN_PACE = 0.3;

function useSmoothCars(data: F1State, geo: ReturnType<typeof useTrackGeometry>) {
  const estimated = Boolean(data.positionsEstimated && data.circuit && geo);
  const els = useRef(new Map<string, SVGGElement>());
  const cars = useRef(new Map<string, number>());
  const latest = useRef({ data, receivedAt: Date.now() });
  const receivedAt = useMemo(() => Date.now(), [data]);
  latest.current = { data, receivedAt };

  const place = useCallback(
    (el: SVGGElement, at: number) => {
      const c = latest.current.data.circuit;
      if (!c || !geo) return;
      const n = c.x.length;
      const i = Math.floor(at) % n;
      const j = (i + 1) % n;
      const f = at - Math.floor(at);
      const [x, y] = geo.toView(c.x[i] + (c.x[j] - c.x[i]) * f, c.y[i] + (c.y[j] - c.y[i]) * f);
      el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    },
    [geo]
  );

  useEffect(() => {
    if (!estimated) return;
    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(0.25, (t - last) / 1000);
      last = t;
      const { data: d, receivedAt: at0 } = latest.current;
      const n = d.circuit?.x.length ?? 0;
      if (n > 1) {
        const wrap = (i: number) => ((i % n) + n) % n;
        for (const [num, target] of estimateTargets(d, Date.now(), at0)) {
          const el = els.current.get(num);
          if (!el) continue;
          const goal = wrap(target.at);
          const prev = cars.current.get(num);
          let p = goal;
          if (prev !== undefined) {
            let err = goal - prev;
            if (err > n / 2) err -= n;
            if (err < -n / 2) err += n;
            if (Math.abs(err) <= n / 8) {
              const pace = target.perSec * dt;
              p = wrap(prev + Math.max(pace * MIN_PACE, pace + err * STEER * dt));
            }
          }
          cars.current.set(num, p);
          place(el, p);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [estimated, place]);

  // ref for a car's <g>: placed straight away so it doesn't flash at 0,0
  const carRef = useCallback(
    (num: string) => (el: SVGGElement | null) => {
      if (!el) {
        els.current.delete(num);
        return;
      }
      els.current.set(num, el);
      const { data: d, receivedAt: at0 } = latest.current;
      const at = cars.current.get(num) ?? estimateTargets(d, Date.now(), at0).get(num)?.at;
      const n = d.circuit?.x.length ?? 0;
      if (at !== undefined && n > 1) place(el, ((at % n) + n) % n);
    },
    [place]
  );

  return estimated ? carRef : null;
}

function CarDot({ color, tla }: { color: string; tla?: string }) {
  return (
    <>
      <circle r={11} fill={color} stroke={C.bg} strokeWidth={2} />
      {tla && (
        <text x={16} fontSize={22} fontWeight={700} fill={C.text} dominantBaseline="central">
          {tla}
        </text>
      )}
    </>
  );
}

// The circuit with yellow sectors, the pit lane and the cars — shared by
// the full view and the multi-game tiles.
export function F1Track({ data }: { data: F1State }) {
  const geo = useTrackGeometry(data.circuit);
  const carRef = useSmoothCars(data, geo);
  const yellow = new Set(data.yellowSectors);
  const pad = 36;
  const inPit = data.drivers.filter((d) => d.inPit && !d.out);
  if (!geo) return <Message>{data.error ?? "Waiting for the circuit map…"}</Message>;
  return (
    <svg viewBox={`${-pad} ${-pad} ${geo.w + pad * 2} ${geo.h + pad * 2}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Circuit map">
      <defs>
        <filter id="f1-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* pit lane */}
      <g stroke="#6b7280" fill="none" strokeLinecap="round">
        <path d={geo.pit.entry} strokeWidth={5} strokeDasharray="10 8" />
        <path d={geo.pit.exit} strokeWidth={5} strokeDasharray="10 8" />
        <path d={geo.pit.d} strokeWidth={8} />
      </g>
      {(() => {
        const [lx, ly] = geo.pit.points[Math.floor(geo.pit.points.length / 2)];
        return (
          <text x={lx} y={ly} dy={-18} fontSize={24} fontWeight={800} fill="#9ca3af" textAnchor="middle">
            PIT
          </text>
        );
      })()}
      {geo.sectors.length === 0 && <path d={geo.outline} fill="none" stroke="#3a404c" strokeWidth={14} strokeLinejoin="round" />}
      {geo.sectors
        .filter((s) => !yellow.has(s.number))
        .map((s) => (
          <path key={s.number} d={s.d} fill="none" stroke="#3a404c" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      {/* yellow sectors on top, wide and glowing so they read from across the room */}
      {geo.sectors
        .filter((s) => yellow.has(s.number))
        .map((s) => (
          <path
            key={`y${s.number}`}
            d={s.d}
            fill="none"
            stroke="#ffe500"
            strokeWidth={30}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#f1-glow)"
            className="f1-yellow"
          />
        ))}
      {inPit.map((d, i) => {
        const pts = geo.pit.points;
        const [x, y] = pts[Math.min(pts.length - 1, Math.round(((i + 1) / (inPit.length + 1)) * (pts.length - 1)))];
        return (
          <g key={`pit${d.number}`}>
            <circle cx={x} cy={y} r={11} fill={d.color} stroke={C.bg} strokeWidth={2} />
            <text x={x} y={y} dy={30} fontSize={18} fontWeight={700} fill={C.text} textAnchor="middle">
              {d.tla}
            </text>
          </g>
        );
      })}
      <circle cx={geo.start[0]} cy={geo.start[1]} r={10} fill="#fff" />
      {data.positionsAvailable &&
        [...data.drivers].reverse().map((d) => {
          if (d.x === undefined || d.y === undefined) return null;
          const [x, y] = geo.toView(d.x, d.y);
          return (
            <g key={d.number} opacity={d.out ? 0.3 : 1} transform={`translate(${x} ${y})`}>
              <CarDot color={d.color} tla={d.position <= 3 ? d.tla : undefined} />
            </g>
          );
        })}
      {/* estimated: moved every frame by useSmoothCars, not by React */}
      {!data.positionsAvailable &&
        carRef &&
        [...data.drivers].reverse().map((d) =>
          d.track && !d.inPit && !d.out ? (
            <g key={d.number} ref={carRef(d.number)}>
              <CarDot color={d.color} tla={d.position <= 3 ? d.tla : undefined} />
            </g>
          ) : null
        )}
    </svg>
  );
}

export default function F1View({ data, leagueColor }: { data: F1State; leagueColor: string }) {
  const geo = useTrackGeometry(data.circuit);
  const status = data.trackStatus ? TRACK_STATUS[data.trackStatus.code] : undefined;
  const finished = /final|ends|inactive/i.test(data.session?.status ?? "");
  const rc = data.raceControl[0];
  const stops = data.pitStops ?? [];

  return (
    <LiveFrame
      league="F1"
      leagueColor={leagueColor}
      live={!finished && data.connected}
      centre={data.session ? `${data.session.meeting} · ${data.session.name}` : "Connecting to live timing…"}
      status={
        status ? (
          <span className={`lv-pill${status.label.includes("Yellow") ? " live-pulse" : ""}`} style={{ background: status.color, color: status.ink }}>
            {status.label}
          </span>
        ) : data.lap ? (
          `Lap ${data.lap.current} / ${data.lap.total}`
        ) : undefined
      }
    >
      {geo ? (
        <Surface
          caption={
            <>
              {/* one row under the track: a yellow sector if there is one,
                  otherwise the latest race control message */}
              {data.yellowSectors.length > 0 ? (
                <span style={{ color: "#ffe500", fontWeight: 800 }}>Yellow in sector {data.yellowSectors.join(", ")}</span>
              ) : rc ? (
                <span style={{ fontWeight: 400 }}>
                  <span style={{ color: rc.flag?.includes("YELLOW") ? C.yellow : C.accent, fontWeight: 700 }}>Race control </span>
                  {rc.message}
                </span>
              ) : (
                <span />
              )}
              {data.positionsEstimated && <span style={{ color: C.muted, fontWeight: 400 }}>Car positions estimated from timing</span>}
              {stops.length > 0 && (
                <span style={{ fontWeight: 400 }}>
                  <span style={{ color: C.muted }}>Pit stops </span>
                  {stops.slice(0, 4).map((s, i) => (
                    <span key={`${s.number}-${s.lap}`}>
                      {i > 0 ? " · " : ""}
                      <b style={{ color: s.color }}>{s.tla}</b> L{s.lap}{" "}
                      {s.from && s.to ? (
                        <>
                          <span style={{ color: tyre(s.from)?.color }}>{tyre(s.from)?.letter}</span>→<span style={{ color: tyre(s.to)?.color }}>{tyre(s.to)?.letter}</span>
                        </>
                      ) : null}
                    </span>
                  ))}
                </span>
              )}
            </>
          }
        >
          <F1Track data={data} />
        </Surface>
      ) : (
        <Message>{data.error ?? "Waiting for the circuit map…"}</Message>
      )}
      <Side>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.15em", fontSize: "0.9em" }}>
          {data.drivers.map((d, i) => (
            <div key={d.number} className="lv-row" style={{ opacity: d.out ? 0.45 : 1 }}>
              <span>
                <span style={{ display: "inline-block", width: "1.6em", color: C.muted, textAlign: "right" }}>{d.position < 99 ? d.position : ""}</span>{" "}
                <span style={{ display: "inline-block", width: "0.25em", height: "0.9em", background: d.color, verticalAlign: "middle" }} />{" "}
                <b>{d.tla}</b>{" "}
                {tyre(d.compound) && (
                  <span
                    title={d.compound}
                    style={{
                      display: "inline-grid",
                      placeItems: "center",
                      width: "1.25em",
                      height: "1.25em",
                      borderRadius: "50%",
                      border: `2px solid ${tyre(d.compound)!.color}`,
                      color: tyre(d.compound)!.color,
                      fontSize: "0.75em",
                      fontWeight: 800,
                      verticalAlign: "middle",
                    }}
                  >
                    {tyre(d.compound)!.letter}
                  </span>
                )}
              </span>
              <span style={{ fontWeight: 400, color: d.inPit ? C.yellow : C.muted }}>{d.out ? "OUT" : d.inPit ? "PIT" : i === 0 ? "Leader" : d.gap}</span>
            </div>
          ))}
        </div>
      </Side>
    </LiveFrame>
  );
}
