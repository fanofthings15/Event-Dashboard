import type { NormalizedEvent } from "../../types";
import Stream from "../Stream";
import { C, ESPORTS_TEAM_COLORS, LiveFrame, Message, Side, SideLabel, useScoreFlash } from "../Layout";
import { useLiveDetail } from "../useLiveDetail";
import type { CsMap, CsState } from "../liveTypes";

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

// Counter-Strike map names and scores come from bo3.gg, found by team names.
export function csUrl(e: NormalizedEvent): string | null {
  const [a, b] = e.teams ?? [];
  if (e.sport !== "cs2" || !a?.name || !b?.name || a.name === "TBD" || b.name === "TBD") return null;
  return `/api/live/cs?team1=${encodeURIComponent(a.name)}&team2=${encodeURIComponent(b.name)}`;
}

// "Cache 13–9 · Nuke live · Dust2" for a tile's one status line.
export function csMapsLine(maps: CsMap[]): string | null {
  if (!maps.length) return null;
  return maps.map((m) => (m.score ? `${m.map} ${m.score[0]}–${m.score[1]}` : m.live ? `${m.map} live` : m.map)).join(" · ");
}

// Each picked map: its score once finished (the winner's side lit), the one
// being played marked live, and under a finished map each team's best player.
function CsMaps({ maps }: { maps: CsMap[] }) {
  return (
    <div className="lv-cs-maps">
      {maps.map((m) => (
        <div key={m.number} className={`lv-cs-map${m.live ? " live" : ""}`}>
          <div className="lv-cs-map-row">
            <span className="lv-cs-map-name">{m.map}</span>
            {m.score ? (
              <span className="lv-cs-map-score">
                <b style={{ color: m.winner === 0 ? ESPORTS_TEAM_COLORS[0] : C.muted }}>{m.score[0]}</b>
                {" – "}
                <b style={{ color: m.winner === 1 ? ESPORTS_TEAM_COLORS[1] : C.muted }}>{m.score[1]}</b>
              </span>
            ) : (
              <span className="lv-cs-map-state">{m.live ? "Live" : "Next"}</span>
            )}
          </div>
          {m.mvps?.map(
            (p, i) =>
              p && (
                <div key={i} className="lv-cs-mvp" style={{ color: ESPORTS_TEAM_COLORS[i] }}>
                  <span className="lv-cs-mvp-name">★ {p.name}</span>
                  <span className="lv-cs-mvp-kd">
                    {p.kills}–{p.deaths} · {p.adr} ADR
                  </span>
                </div>
              )
          )}
        </div>
      ))}
    </div>
  );
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
  const { data: cs } = useLiveDetail<CsState>(csUrl(event), 30_000);
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
        {cs && cs.maps.length > 0 && (
          <>
            <SideLabel>Maps</SideLabel>
            <CsMaps maps={cs.maps} />
          </>
        )}
      </Side>
    </LiveFrame>
  );
}
