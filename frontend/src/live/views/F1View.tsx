import { useMemo } from "react";
import type { F1State } from "../liveTypes";
import { C, LiveFrame, Line, Message, Side, Surface } from "../Layout";

// TrackStatus codes from the live-timing feed. 1 (all clear) gets no pill.
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
    return { toView, outline: path(pts) + " Z", sectors, start: pts[0], w, h };
  }, [circuit]);
}

export default function F1View({ data, leagueColor }: { data: F1State; leagueColor: string }) {
  const geo = useTrackGeometry(data.circuit);
  const yellow = new Set(data.yellowSectors);
  const status = data.trackStatus ? TRACK_STATUS[data.trackStatus.code] : undefined;
  const finished = /final|ends|inactive/i.test(data.session?.status ?? "");
  const rc = data.raceControl[0];
  const pad = 40;

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
            data.yellowSectors.length > 0 ? (
              <span style={{ color: C.yellow }}>Yellow in sector {data.yellowSectors.join(", ")}</span>
            ) : status || !data.lap ? undefined : (
              <span style={{ color: C.muted }}>Track clear</span>
            )
          }
        >
          <svg viewBox={`${-pad} ${-pad} ${geo.w + pad * 2} ${geo.h + pad * 2}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Circuit map">
            {geo.sectors.length === 0 && <path d={geo.outline} fill="none" stroke="#3a404c" strokeWidth={14} strokeLinejoin="round" />}
            {geo.sectors.map((s) => (
              <path
                key={s.number}
                d={s.d}
                fill="none"
                stroke={yellow.has(s.number) ? C.yellow : "#3a404c"}
                strokeWidth={yellow.has(s.number) ? 20 : 14}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={yellow.has(s.number) ? "live-pulse" : undefined}
              />
            ))}
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
                <b>{d.tla}</b>
              </span>
              <span style={{ fontWeight: 400, color: d.inPit ? C.yellow : C.muted }}>{d.out ? "OUT" : d.inPit ? "PIT" : i === 0 ? "Leader" : d.gap}</span>
            </div>
          ))}
        </div>
      </Side>
    </LiveFrame>
  );
}
