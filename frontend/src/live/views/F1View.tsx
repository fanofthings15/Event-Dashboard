import { useMemo } from "react";
import type { F1State } from "../liveTypes";
import { C, Footer, Header, Panel, Screen, clip } from "../Screen";

const BOX = { x: 24, y: 76, w: 556, h: 340 };

// TrackStatus codes from the live-timing feed. 1 (all clear) gets no pill.
const TRACK_STATUS: Record<string, { label: string; color: string; ink: string }> = {
  "2": { label: "YELLOW FLAG", color: C.yellow, ink: "#1a1600" },
  "4": { label: "SAFETY CAR", color: "#f97316", ink: "#1a0d00" },
  "5": { label: "RED FLAG", color: C.live, ink: "#fff" },
  "6": { label: "VIRTUAL SAFETY CAR", color: "#f97316", ink: "#1a0d00" },
  "7": { label: "VSC ENDING", color: "#f97316", ink: "#1a0d00" },
};

// Circuit coordinates come in F1's own units, y-up, plus a per-circuit
// rotation that makes the layout match the familiar TV orientation.
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
    const scale = Math.min(BOX.w / (Math.max(...xs) - minX), BOX.h / (Math.max(...ys) - minY));
    const offX = BOX.x + (BOX.w - (Math.max(...xs) - minX) * scale) / 2;
    const offY = BOX.y + (BOX.h - (Math.max(...ys) - minY) * scale) / 2;
    const toScreen = (x: number, y: number): [number, number] => {
      const [rx, ry] = rot(x, y);
      return [offX + (rx - minX) * scale, offY + (ry - minY) * scale];
    };
    const pts = circuit.x.map((x, i) => toScreen(x, circuit.y[i]));

    // Each marshal sector runs from its start point to the next sector's,
    // located by the nearest point on the outline.
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
      return { number: s.number, d: "M" + seg.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L") };
    });
    return { toScreen, outline: "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L") + " Z", sectors, start: pts[0] };
  }, [circuit]);
}

export default function F1View({ data, leagueColor }: { data: F1State; leagueColor: string }) {
  const geo = useTrackGeometry(data.circuit);
  const yellow = new Set(data.yellowSectors);
  const status = data.trackStatus ? TRACK_STATUS[data.trackStatus.code] : undefined;
  const finished = /final|ends|inactive/i.test(data.session?.status ?? "");
  const rowH = Math.min(18, 392 / Math.max(1, data.drivers.length));
  const rc = data.raceControl[0];

  return (
    <Screen label="F1 live track view">
      <Header
        league="F1"
        leagueColor={leagueColor}
        live={!finished && data.connected}
        centre={
          <text x={400} y={36} fontSize={17} fontWeight={700} fill={C.text} textAnchor="middle">
            {data.session ? clip(`${data.session.meeting} · ${data.session.name}`, 40) : "Connecting to live timing…"}
          </text>
        }
        right={
          status ? (
            <g>
              <rect x={600} y={16} width={182} height={26} rx={6} fill={status.color} className={status.label.includes("YELLOW") ? "live-pulse" : undefined} />
              <text x={691} y={34} fontSize={13} fontWeight={800} fill={status.ink} textAnchor="middle">
                {status.label}
              </text>
            </g>
          ) : data.lap ? (
            `Lap ${data.lap.current} / ${data.lap.total}`
          ) : undefined
        }
      />

      {geo ? (
        <g>
          {geo.sectors.map((s) => (
            <path
              key={s.number}
              d={s.d}
              fill="none"
              stroke={yellow.has(s.number) ? C.yellow : "#3a404c"}
              strokeWidth={yellow.has(s.number) ? 9 : 7}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={yellow.has(s.number) ? "live-pulse" : undefined}
            />
          ))}
          {geo.sectors.length === 0 && <path d={geo.outline} fill="none" stroke="#3a404c" strokeWidth={7} strokeLinejoin="round" />}
          <circle cx={geo.start[0]} cy={geo.start[1]} r={5} fill="#fff" />
          {data.positionsAvailable &&
            [...data.drivers].reverse().map((d) => {
              if (d.x === undefined || d.y === undefined) return null;
              const [x, y] = geo.toScreen(d.x, d.y);
              return (
                <g key={d.number} opacity={d.out ? 0.3 : 1}>
                  <circle cx={x} cy={y} r={5} fill={d.color} stroke={C.bg} strokeWidth={1} />
                  {d.position <= 3 && (
                    <text x={x + 8} y={y + 4} fontSize={10} fontWeight={700} fill={C.text}>
                      {d.tla}
                    </text>
                  )}
                </g>
              );
            })}
        </g>
      ) : (
        <text x={BOX.x + BOX.w / 2} y={BOX.y + BOX.h / 2} fontSize={14} fill={C.muted} textAnchor="middle">
          {data.error ? clip(data.error, 60) : "Waiting for the circuit map…"}
        </text>
      )}

      {data.yellowSectors.length > 0 && (
        <text x={24} y={92} fontSize={13} fontWeight={800} fill={C.yellow}>
          YELLOW · SECTOR {data.yellowSectors.join(", ")}
        </text>
      )}
      {rc && (
        <g>
          <Panel x={18} y={430} w={562} h={38} />
          <text x={32} y={454} fontSize={12} fontWeight={700} fill={rc.flag === "YELLOW" || rc.flag === "DOUBLE YELLOW" ? C.yellow : C.accent}>
            RACE CONTROL
          </text>
          <text x={142} y={454} fontSize={12} fill={C.text}>
            {clip(rc.message, 62)}
          </text>
        </g>
      )}

      <Panel x={596} y={70} w={190} h={400} />
      {data.drivers.map((d, i) => {
        const y = 88 + i * rowH;
        return (
          <g key={d.number} opacity={d.out ? 0.4 : 1}>
            <text x={618} y={y} fontSize={11} fill={C.muted} textAnchor="end">
              {d.position < 99 ? d.position : ""}
            </text>
            <rect x={624} y={y - 9} width={3} height={11} fill={d.color} />
            <text x={633} y={y} fontSize={11.5} fontWeight={600} fill={C.text}>
              {d.tla}
            </text>
            <text x={776} y={y} fontSize={11} fill={d.inPit ? C.yellow : C.muted} textAnchor="end">
              {d.out ? "OUT" : d.inPit ? "PIT" : i === 0 ? "Leader" : clip(d.gap, 10)}
            </text>
          </g>
        );
      })}
      <Footer>
        F1 live timing{data.positionsAvailable ? " · car positions ~4 Hz" : " · no car positions in the feed right now"} · circuit map from MultiViewer
      </Footer>
    </Screen>
  );
}
