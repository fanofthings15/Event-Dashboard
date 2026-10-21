import type { FrcAlliance, FrcState } from "../liveTypes";
import { C, LiveFrame, Message, Side, SideLabel, Source } from "../Layout";

const RED = "#ef4444";
const BLUE = "#3b82f6";

function minutesUntil(unixSeconds?: number): string | undefined {
  if (!unixSeconds) return undefined;
  const mins = Math.round((unixSeconds * 1000 - Date.now()) / 60000);
  if (mins <= 0) return "now";
  return mins < 60 ? `in ~${mins} min` : `in ~${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function Alliance({ alliance, color, mine }: { alliance?: FrcAlliance; color: string; mine?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6em", minWidth: 0 }}>
      {(alliance?.teams ?? []).map((t) => {
        const me = t === mine;
        return (
          <div
            key={t}
            style={{
              border: `2px solid ${color}`,
              background: me ? color : `${color}33`,
              color: me ? "#fff" : C.text,
              borderRadius: "0.4em",
              padding: "0.5em 0.8em",
              fontSize: "1.5em",
              fontWeight: 800,
              textAlign: "center",
            }}
          >
            {me ? `★ ${t}` : t}
          </div>
        );
      })}
    </div>
  );
}

// TBA has no field geometry (and the field changes every season), so FRC
// gets an alliance board rather than a drawn field.
export default function FrcView({ data, eventName, leagueColor }: { data: FrcState; eventName: string; leagueColor: string }) {
  const mine = data.myTeam?.number;
  const last = data.last;
  const total = (last?.red.score ?? 0) + (last?.blue.score ?? 0);
  const redPct = total > 0 ? ((last?.red.score ?? 0) / total) * 100 : 50;

  return (
    <LiveFrame
      league="FRC"
      leagueColor={leagueColor}
      centre={data.eventName ?? eventName}
      status={data.onField?.label}
      footer={<Source>The Blue Alliance · scores post after each match</Source>}
    >
      {data.error ? (
        <Message>{data.error}</Message>
      ) : (
        <>
          <section className="lv-main" style={{ justifyContent: "center", gap: "1.2em" }}>
            <div className="lv-label">{data.onField ? `Up now · ${data.onField.label}${data.onField.time ? ` · scheduled ${minutesUntil(data.onField.time)}` : ""}` : "No match queued"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "1.2em", alignItems: "center" }}>
              <Alliance alliance={data.onField?.red} color={RED} mine={mine} />
              <div style={{ color: C.muted, fontWeight: 800, fontSize: "1.4em" }}>vs</div>
              <Alliance alliance={data.onField?.blue} color={BLUE} mine={mine} />
            </div>
            {last && (
              <div className="lv-side" style={{ gap: "0.5em" }}>
                <div className="lv-label">Last match · {last.label}</div>
                <div className="lv-bar" style={{ height: "1.6em", fontWeight: 800, color: "#fff" }}>
                  <span style={{ width: `${redPct}%`, background: RED, padding: "0 0.6em", display: "flex", alignItems: "center" }}>Red {last.red.score ?? "–"}</span>
                  <span style={{ flex: 1, background: BLUE, padding: "0 0.6em", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    {last.blue.score ?? "–"} Blue
                  </span>
                </div>
                <div className="lv-line">
                  Red {last.red.teams.join(" · ")} — Blue {last.blue.teams.join(" · ")}
                  {last.winner ? ` · ${last.winner === "red" ? "Red" : "Blue"} wins` : ""}
                </div>
              </div>
            )}
          </section>
          <Side>
            {data.myTeam && (
              <>
                <SideLabel>Following</SideLabel>
                <div className="lv-big" style={{ color: C.accent }}>
                  ★ {data.myTeam.number}
                </div>
                <div>
                  {data.myTeam.next
                    ? `Next: ${data.myTeam.next.label} · ${data.myTeam.next.alliance === "red" ? "Red" : "Blue"} ${minutesUntil(data.myTeam.next.time) ?? ""}`
                    : "No more matches scheduled"}
                </div>
                {data.myTeam.rank && (
                  <div>
                    Rank {data.myTeam.rank}
                    {data.myTeam.rankedTeams ? ` of ${data.myTeam.rankedTeams}` : ""}
                    {data.myTeam.record ? ` · ${data.myTeam.record}` : ""}
                  </div>
                )}
              </>
            )}
            <SideLabel>Rankings</SideLabel>
            {(data.rankings ?? []).map((r) => (
              <div key={r.team} className="lv-row" style={r.team === mine ? { color: C.accent } : undefined}>
                <span>
                  <span style={{ color: C.muted, display: "inline-block", width: "1.6em" }}>{r.rank}</span> {r.team}
                </span>
                <span style={{ fontWeight: 400, color: C.muted }}>{r.record ?? ""}</span>
              </div>
            ))}
          </Side>
        </>
      )}
    </LiveFrame>
  );
}
