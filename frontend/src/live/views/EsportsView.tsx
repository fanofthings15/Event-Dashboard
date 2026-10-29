import type { NormalizedEvent } from "../../types";
import Stream from "../Stream";
import { C, ESPORTS_TEAM_COLORS, LiveFrame, Message, Side, SideLabel, useScoreFlash } from "../Layout";

// "1-0 (Bo3)", "Best of 5" or "2-1" — esports.ts's seriesScore formats.
function parseSeries(s?: string): { wins?: [number, number]; bestOf?: number } {
  if (!s) return {};
  const wins = s.match(/(\d+)-(\d+)/);
  const bo = s.match(/Bo(\d+)|Best of (\d+)/i);
  return {
    wins: wins ? [Number(wins[1]), Number(wins[2])] : undefined,
    bestOf: bo ? Number(bo[1] ?? bo[2]) : undefined,
  };
}


// Esports are the live broadcast itself, with the series beside it.
export default function EsportsView({
  event,
  label,
  leagueColor,
  stream,
}: {
  event: NormalizedEvent;
  label: string;
  leagueColor: string;
  stream: { embed: string; source: string } | null;
}) {
  const teams = event.teams ?? [];
  const { wins, bestOf } = parseSeries(event.seriesScore);
  const needed = bestOf ? Math.ceil(bestOf / 2) : undefined;
  const flash = useScoreFlash(
    wins,
    teams.slice(0, 2).map((t, i) => ({ abbr: t.name, color: ESPORTS_TEAM_COLORS[i] })),
    (_d, team) => ({ banner: `Map to ${team}`, ms: 8000 })
  );

  return (
    <LiveFrame
      league={label}
      leagueColor={leagueColor}
      centre={
        <div className="lv-score">
          <span style={{ color: ESPORTS_TEAM_COLORS[0] }}>{teams[0]?.name ?? "TBD"}</span>
          <span className="lv-score-num">{wins ? `${wins[0]} – ${wins[1]}` : "vs"}</span>
          <span style={{ color: ESPORTS_TEAM_COLORS[1] }}>{teams[1]?.name ?? "TBD"}</span>
        </div>
      }
      status={event.league}
    >
      {flash}
      <section className="lv-main" style={{ alignItems: "center", justifyContent: "center" }}>
        {stream ? <Stream embed={stream.embed} /> : <Message>No embeddable stream for this match</Message>}
      </section>
      <Side>
        <SideLabel>{bestOf ? `Series · best of ${bestOf}` : "Match"}</SideLabel>
        {teams.slice(0, 2).map((t, i) => (
          <div key={i} className="lv-series-team" style={{ color: ESPORTS_TEAM_COLORS[i] }}>
            {t.imageUrl ? <img src={t.imageUrl} alt="" /> : <span className="lv-logo-blank" style={{ background: `${ESPORTS_TEAM_COLORS[i]}44` }} />}
            <div style={{ minWidth: 0 }}>
              <div className="lv-name">{t.name}</div>
              {needed && (
                <div className="lv-pips">
                  {Array.from({ length: needed }, (_, k) => (
                    <i key={k} className={wins && k < wins[i] ? "on" : undefined} />
                  ))}
                </div>
              )}
            </div>
            {wins && (
              <span className="lv-big" style={{ color: C.text }}>
                {wins[i]}
              </span>
            )}
          </div>
        ))}
      </Side>
    </LiveFrame>
  );
}
