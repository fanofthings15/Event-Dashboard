import type { BaseballState } from "../liveTypes";
import { teamColors } from "../teamColors";
import { Below, C, LiveFrame, Line, Scoreboard, Side, Surface, useScoreFlash } from "../Layout";
import Ballpark, { BASES, Base } from "../surfaces/Ballpark";
import BallFlight from "../surfaces/BallFlight";

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
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35em" }}>
      <span style={{ color: C.muted, fontWeight: 700 }}>{label}</span>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} style={{ width: "0.85em", height: "0.85em", borderRadius: "50%", border: `2px solid ${color}`, background: i < n ? color : "none" }} />
      ))}
    </span>
  );
}

export default function BaseballView({ data, leagueColor }: { data: BaseballState; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const innings = Math.max(9, away?.linescores.length ?? 0, home?.linescores.length ?? 0);
  const lastPitch = data.pitches.at(-1);
  const hits = data.hits ?? [];
  const lastHit = hits.at(-1);
  const flash = useScoreFlash(
    away && home ? [Number(away.score), Number(home.score)] : undefined,
    [
      { abbr: away?.abbr ?? "", color: awayColor },
      { abbr: home?.abbr ?? "", color: homeColor },
    ],
    (d, team) => ({
      banner: `${lastHit?.result === "Home Run" ? (d >= 4 ? "Grand slam" : "Home run") : d === 1 ? "Run scores" : `${d} runs score`} · ${team}`,
      ms: 8000,
    })
  );

  return (
    <LiveFrame
      layout="stack"
      league="MLB"
      leagueColor={leagueColor}
      live={data.state === "in"}
      centre={<Scoreboard away={{ ...away, color: awayColor }} home={{ ...home, color: homeColor }} />}
      status={data.state === "in" && data.inning ? data.inning : data.detail}
    >
      {flash}
      <Surface
        caption={
          <span>
            {data.fence?.venue ? `${data.fence.venue} · ` : ""}
            {lastHit
              ? `Last ball in play: ${[lastHit.result, lastHit.distance ? `${Math.round(lastHit.distance)} ft` : null, lastHit.speed ? `${lastHit.speed} mph` : null, lastHit.angle !== undefined ? `${lastHit.angle}°` : null].filter(Boolean).join(", ")}`
              : "No balls in play yet"}
          </span>
        }
      >
        <Ballpark fence={data.fence}>
          {/* earlier balls in play this game, as a faint spray chart */}
          {hits.slice(0, -1).map((h) => (
            <circle key={h.id} cx={h.x} cy={-h.y} r={3.5} fill="#fff" fillOpacity={0.35} />
          ))}
          <Base at={BASES.first} on={data.onFirst} />
          <Base at={BASES.second} on={data.onSecond} />
          <Base at={BASES.third} on={data.onThird} />
          <BallFlight hit={lastHit} />
        </Ballpark>
      </Surface>
      <Below
        left={
          <div style={{ display: "flex", gap: "1.2em", alignItems: "center", minWidth: 0 }}>
            <svg viewBox="40 100 150 150" style={{ width: "7.5em", height: "7.5em", flex: "none" }} role="img" aria-label="Pitch locations this at-bat">
              <rect x={40} y={100} width={150} height={150} rx={6} fill="var(--panel)" />
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
              {lastPitch && (
                <circle key={data.pitches.length} cx={lastPitch.x} cy={lastPitch.y} r={12} fill="none" stroke={pitchColor(lastPitch.result)} strokeWidth={2} className="live-pulse" />
              )}
            </svg>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4em", minWidth: 0 }}>
              <div style={{ display: "flex", gap: "1.2em", flexWrap: "wrap" }}>
                <Dots label="B" n={data.balls} total={4} color={C.green} />
                <Dots label="S" n={data.strikes} total={3} color={C.live} />
                <Dots label="O" n={data.outs} total={3} color={C.yellow} />
              </div>
              {lastPitch && (
                <Line>
                  Pitch {data.pitches.length}: {lastPitch.type ?? "Pitch"}
                  {lastPitch.mph ? ` ${lastPitch.mph} mph` : ""} · <span style={{ color: pitchColor(lastPitch.result) }}>{lastPitch.result}</span>
                </Line>
              )}
              {data.matchup && <Line>{data.matchup}</Line>}
              <Line primary>{data.lastPlay ?? ""}</Line>
            </div>
          </div>
        }
        right={
          <Side>
            <table className="lv-grid">
              <thead>
                <tr>
                  <th />
                  {Array.from({ length: innings }, (_, i) => (
                    <th key={i}>{i + 1}</th>
                  ))}
                  <th>R</th>
                  <th>H</th>
                  <th>E</th>
                </tr>
              </thead>
              <tbody>
                {[away, home].map((t, k) => (
                  <tr key={k}>
                    <td style={{ color: k ? homeColor : awayColor }}>{t?.abbr}</td>
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
          </Side>
        }
      />
    </LiveFrame>
  );
}
