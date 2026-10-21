import type { BasketballState } from "../liveTypes";
import { teamColors } from "../teamColors";
import { LiveFrame, Line, Scoreboard, Side, SideLabel, Source, StatTable, Surface } from "../Layout";
import Court, { COURT_H, COURT_W, RIM_X } from "../surfaces/Court";

export default function BasketballView({ data, leagueColor }: { data: BasketballState; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const s = (id: string | undefined, name: string) => data.stats[id ?? ""]?.[name];

  return (
    <LiveFrame
      league="NBA"
      leagueColor={leagueColor}
      live={data.state === "in"}
      centre={<Scoreboard away={{ ...away, color: awayColor }} home={{ ...home, color: homeColor }} />}
      status={data.detail}
      footer={
        <>
          <Line primary>{data.recent[0] ?? ""}</Line>
          {data.recent[1] && <Line>{data.recent[1]}</Line>}
          <Source>ESPN play-by-play · free throws aren't charted</Source>
        </>
      }
    >
      <Surface
        caption={
          <>
            <span style={{ color: awayColor }}>{away?.abbr} shots</span>
            <span style={{ color: homeColor }}>{home?.abbr} shots</span>
          </>
        }
      >
        <Court awayPaint="#b97a45" homePaint="#b97a45">
          {data.shots.map((shot, i) => {
            // ESPN shot spots are half-court feet: x across the width, y out
            // from the rim (not the baseline). Away shoots at the left
            // basket, home at the right.
            const isHome = shot.teamId === home?.id;
            const cx = Math.min(COURT_W - 0.5, Math.max(0.5, isHome ? COURT_W - RIM_X - shot.y : RIM_X + shot.y));
            const cy = Math.min(COURT_H - 0.5, Math.max(0.5, isHome ? COURT_H - shot.x : shot.x));
            const color = isHome ? homeColor : awayColor;
            return shot.made ? (
              <circle key={i} cx={cx} cy={cy} r={0.75} fill={color} stroke="#111" strokeWidth={0.15} />
            ) : (
              <path key={i} d={`M${cx - 0.55} ${cy - 0.55} L${cx + 0.55} ${cy + 0.55} M${cx + 0.55} ${cy - 0.55} L${cx - 0.55} ${cy + 0.55}`} stroke={color} strokeWidth={0.28} />
            );
          })}
        </Court>
      </Surface>
      <Side>
        <StatTable
          teams={[
            { abbr: away?.abbr ?? "", color: awayColor },
            { abbr: home?.abbr ?? "", color: homeColor },
          ]}
          rows={[
            ["Field goals", s(away?.id, "fieldGoalsMade-fieldGoalsAttempted"), s(home?.id, "fieldGoalsMade-fieldGoalsAttempted")],
            ["3-pointers", s(away?.id, "threePointFieldGoalsMade-threePointFieldGoalsAttempted"), s(home?.id, "threePointFieldGoalsMade-threePointFieldGoalsAttempted")],
            ["Free throws", s(away?.id, "freeThrowsMade-freeThrowsAttempted"), s(home?.id, "freeThrowsMade-freeThrowsAttempted")],
            ["Rebounds", s(away?.id, "totalRebounds"), s(home?.id, "totalRebounds")],
            ["Assists", s(away?.id, "assists"), s(home?.id, "assists")],
            ["Turnovers", s(away?.id, "totalTurnovers"), s(home?.id, "totalTurnovers")],
            ["Fouls", s(away?.id, "fouls"), s(home?.id, "fouls")],
          ]}
        />
        <SideLabel>● made · ✕ missed</SideLabel>
      </Side>
    </LiveFrame>
  );
}
