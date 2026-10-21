import type { BaseballState } from "../liveTypes";
import { teamColors } from "../teamColors";
import { C, LiveFrame, Line, Scoreboard, Side, SideLabel, Surface, useScoreFlash } from "../Layout";
import Ballpark, { BASES, Base } from "../surfaces/Ballpark";

// ESPN pitch coordinates are gamecast pixels, not real units. The strike
// zone (x 82..145, y 146..194) is what separated called strikes from balls
// in 541 recent pitches — see backend/src/liveEspn.ts.
const ZONE = { x: 82, y: 146, w: 63, h: 48 };

function pitchColor(result: string): string {
  if (/ball/i.test(result) && !/foul/i.test(result)) return C.green;
  if (/strike|foul|swinging/i.test(result)) return C.live;
  return C.accent; // put in play
}

function Dots({ label, n, total, color }: { label: string; n: number; total: number; color: string }) {
  return (
    <div className="lv-row" style={{ justifyContent: "flex-start", gap: "0.6em" }}>
      <span style={{ width: "1.2em", color: C.muted, fontWeight: 700 }}>{label}</span>
      <span style={{ display: "flex", gap: "0.35em" }}>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} style={{ width: "0.9em", height: "0.9em", borderRadius: "50%", border: `2px solid ${color}`, background: i < n ? color : "none" }} />
        ))}
      </span>
    </div>
  );
}

export default function BaseballView({ data, leagueColor }: { data: BaseballState; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const innings = Math.max(9, away?.linescores.length ?? 0, home?.linescores.length ?? 0);
  const flash = useScoreFlash(
    away && home ? [Number(away.score), Number(home.score)] : undefined,
    [
      { abbr: away?.abbr ?? "", color: awayColor },
      { abbr: home?.abbr ?? "", color: homeColor },
    ],
    (d, team) => ({ banner: `${d >= 4 ? "Grand slam" : d === 1 ? "Run scores" : `${d} runs score`} · ${team}`, ms: 7000 })
  );

  return (
    <LiveFrame
      league="MLB"
      leagueColor={leagueColor}
      live={data.state === "in"}
      centre={<Scoreboard away={{ ...away, color: awayColor }} home={{ ...home, color: homeColor }} />}
      status={data.state === "in" && data.inning ? data.inning : data.detail}
      footer={
        <>
          <table className="lv-stats" style={{ maxWidth: "40em" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }} />
                {Array.from({ length: innings }, (_, i) => (
                  <th key={i} style={{ color: C.muted }}>
                    {i + 1}
                  </th>
                ))}
                <th>R</th>
                <th>H</th>
                <th>E</th>
              </tr>
            </thead>
            <tbody>
              {[away, home].map((t, k) => (
                <tr key={k}>
                  <td style={{ color: k ? homeColor : awayColor, fontWeight: 800 }}>{t?.abbr}</td>
                  {Array.from({ length: innings }, (_, i) => (
                    <td key={i} style={{ fontWeight: 400 }}>
                      {t?.linescores[i] ?? ""}
                    </td>
                  ))}
                  <td>{t?.score}</td>
                  <td>{t?.hits ?? "–"}</td>
                  <td>{t?.errors ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Line primary>{data.lastPlay ?? ""}</Line>
        </>
      }
    >
      {flash}
      <Surface>
        <Ballpark>
          <Base at={BASES.first} on={data.onFirst} />
          <Base at={BASES.second} on={data.onSecond} />
          <Base at={BASES.third} on={data.onThird} />
        </Ballpark>
      </Surface>
      <Side>
        <Dots label="B" n={data.balls} total={4} color={C.green} />
        <Dots label="S" n={data.strikes} total={3} color={C.live} />
        <Dots label="O" n={data.outs} total={3} color={C.yellow} />
        {data.matchup && <div>{data.matchup}</div>}
        <SideLabel>This at-bat</SideLabel>
        <svg viewBox="40 100 150 150" style={{ width: "100%", maxHeight: "12em", flex: "none" }} role="img" aria-label="Pitch locations">
          <rect x={ZONE.x} y={ZONE.y} width={ZONE.w} height={ZONE.h} fill="none" stroke="#fff" strokeOpacity={0.75} strokeWidth={1.2} />
          {[1, 2].map((k) => (
            <g key={k} stroke="#fff" strokeOpacity={0.15}>
              <line x1={ZONE.x + (ZONE.w * k) / 3} x2={ZONE.x + (ZONE.w * k) / 3} y1={ZONE.y} y2={ZONE.y + ZONE.h} />
              <line x1={ZONE.x} x2={ZONE.x + ZONE.w} y1={ZONE.y + (ZONE.h * k) / 3} y2={ZONE.y + (ZONE.h * k) / 3} />
            </g>
          ))}
          {data.pitches.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={7} fill={pitchColor(p.result)} stroke={C.bg} strokeWidth={1} />
              <text x={p.x} y={p.y} fontSize={8} fontWeight={800} fill={C.bg} textAnchor="middle" dominantBaseline="central">
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
        {data.pitches.slice(-4).map((p, i, arr) => (
          <div className="lv-row" key={i}>
            <span>
              {data.pitches.length - arr.length + i + 1}. {p.type ?? "Pitch"} {p.mph ? `${p.mph} mph` : ""}
            </span>
            <span style={{ color: pitchColor(p.result) }}>{p.result}</span>
          </div>
        ))}
      </Side>
    </LiveFrame>
  );
}
