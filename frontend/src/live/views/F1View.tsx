import { useMemo } from "react";
import type { F1State } from "../liveTypes";
import { C, LiveFrame, Line, Message, Side, Surface } from "../Layout";

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

export default function F1View({ data, leagueColor }: { data: F1State; leagueColor: string }) {
  const geo = useTrackGeometry(data.circuit);
  const yellow = new Set(data.yellowSectors);
  const status = data.trackStatus ? TRACK_STATUS[data.trackStatus.code] : undefined;
  const finished = /final|ends|inactive/i.test(data.session?.status ?? "");
  const rc = data.raceControl[0];
  const pad = 70;
  const inPit = data.drivers.filter((d) => d.inPit && !d.out);
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
      footer={
        <>
          {rc && (
            <Line primary>
              <span style={{ color: rc.flag?.includes("YELLOW") ? C.yellow : C.accent, fontWeight: 700 }}>Race control </span>
              {rc.message}
            </Line>
          )}
        </>
      }
    >
      {geo ? (
        <Surface
          caption={
            <>
              {data.yellowSectors.length > 0 ? (
                <span style={{ color: "#ffe500", fontWeight: 800 }}>Yellow in sector {data.yellowSectors.join(", ")}</span>
              ) : status || !data.lap ? (
                <span />
              ) : (
                <span style={{ color: C.muted }}>Track clear</span>
              )}
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
                      {s.seconds ? ` ${s.seconds.toFixed(1)}s` : ""}
                    </span>
                  ))}
                </span>
              )}
            </>
          }
        >
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
                  <g key={d.number} opacity={d.out ? 0.3 : 1}>
                    <circle cx={x} cy={y} r={11} fill={d.color} stroke={C.bg} strokeWidth={2} />
                    {d.position <= 3 && (
                      <text x={x + 16} y={y} fontSize={22} fontWeight={700} fill={C.text} dominantBaseline="central">
                        {d.tla}
                      </text>
                    )}
                  </g>
                );
              })}
          </svg>
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
