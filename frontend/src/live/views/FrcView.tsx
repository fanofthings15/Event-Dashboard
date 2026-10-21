import { useState } from "react";
import type { FrcAlliance, FrcState } from "../liveTypes";
import Stream, { embeddableStream } from "../Stream";
import { C, LiveFrame, Message, Side, SideLabel, Source } from "../Layout";

const RED = "#ef4444";
const BLUE = "#3b82f6";

function minutesUntil(unixSeconds?: number): string | undefined {
  if (!unixSeconds) return undefined;
  const mins = Math.round((unixSeconds * 1000 - Date.now()) / 60000);
  if (mins <= 0) return "now";
  return mins < 60 ? `in ~${mins} min` : `in ~${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function Alliance({ alliance, color, mine, compact }: { alliance?: FrcAlliance; color: string; mine?: string; compact?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: compact ? "row" : "column", gap: compact ? "0.35em" : "0.6em", minWidth: 0 }}>
      {(alliance?.teams ?? []).map((t) => {
        const me = t === mine;
        return (
          <div
            key={t}
            style={{
              flex: compact ? 1 : undefined,
              border: `2px solid ${color}`,
              background: me ? color : `${color}33`,
              color: me ? "#fff" : C.text,
              borderRadius: "0.4em",
              padding: compact ? "0.2em 0.3em" : "0.5em 0.8em",
              fontSize: compact ? "1em" : "1.5em",
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

// Paste-a-link bar for the event's webcast. TBA's data the app reads has no
// stream, so the link is saved per event in settings.
function StreamLinkBar({ initial, onSave, onCancel }: { initial?: string; onSave: (url: string) => void; onCancel?: () => void }) {
  const [value, setValue] = useState(initial ?? "");
  const embeddable = value.trim() === "" || Boolean(embeddableStream([value.trim()]));
  return (
    <form
      className="lv-linkbar"
      onSubmit={(e) => {
        e.preventDefault();
        if (embeddable) onSave(value.trim());
      }}
    >
      <label htmlFor="frc-stream-url">Event stream link</label>
      <div>
        <input
          id="frc-stream-url"
          type="url"
          inputMode="url"
          placeholder="https://www.twitch.tv/firstinspires"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="primary" disabled={!embeddable}>
          Show stream
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {!embeddable && <p>That link can't be embedded. Use a youtube.com/watch, kick.com or twitch.tv channel link.</p>}
    </form>
  );
}

// TBA has no field geometry (and the field changes every season), so FRC
// gets an alliance board. With a stream link set, the webcast takes the main
// area and the match info moves into the side panel.
export default function FrcView({
  data,
  eventName,
  leagueColor,
  streamUrl,
  onSaveStream,
}: {
  data: FrcState;
  eventName: string;
  leagueColor: string;
  streamUrl?: string;
  onSaveStream: (url: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const stream = streamUrl ? embeddableStream([streamUrl]) : null;
  const mine = data.myTeam?.number;
  const last = data.last;
  const total = (last?.red.score ?? 0) + (last?.blue.score ?? 0);
  const redPct = total > 0 ? ((last?.red.score ?? 0) / total) * 100 : 50;

  const lastMatch = last && (
    <div className="lv-side" style={{ gap: "0.5em", width: "auto", maxWidth: "none" }}>
      <div className="lv-label">Last match · {last.label}</div>
      <div className="lv-bar" style={{ height: "1.6em", fontWeight: 800, color: "#fff" }}>
        <span style={{ width: `${redPct}%`, background: RED, padding: "0 0.6em", display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
          {stream ? "" : "Red "}
          {last.red.score ?? "–"}
        </span>
        <span style={{ flex: 1, background: BLUE, padding: "0 0.6em", display: "flex", alignItems: "center", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
          {last.blue.score ?? "–"}
          {stream ? "" : " Blue"}
        </span>
      </div>
      {!stream && (
        <div className="lv-line">
          Red {last.red.teams.join(" · ")} — Blue {last.blue.teams.join(" · ")}
          {last.winner ? ` · ${last.winner === "red" ? "Red" : "Blue"} wins` : ""}
        </div>
      )}
    </div>
  );

  const following = data.myTeam && (
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
  );

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
      ) : stream && !editing ? (
        <>
          <section className="lv-main" style={{ alignItems: "center", justifyContent: "center" }}>
            <Stream embed={stream.embed} />
          </section>
          <Side>
            <SideLabel>{data.onField ? `Up now · ${data.onField.label}` : "No match queued"}</SideLabel>
            <Alliance alliance={data.onField?.red} color={RED} mine={mine} compact />
            <Alliance alliance={data.onField?.blue} color={BLUE} mine={mine} compact />
            {lastMatch}
            {following}
            <button className="lv-textbtn" onClick={() => setEditing(true)}>
              Change stream link
            </button>
          </Side>
        </>
      ) : (
        <>
          <section className="lv-main" style={{ justifyContent: "center", gap: "1.2em" }}>
            <StreamLinkBar
              initial={streamUrl}
              onSave={(url) => {
                onSaveStream(url);
                setEditing(false);
              }}
              onCancel={editing ? () => setEditing(false) : undefined}
            />
            <div className="lv-label">{data.onField ? `Up now · ${data.onField.label}${data.onField.time ? ` · scheduled ${minutesUntil(data.onField.time)}` : ""}` : "No match queued"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "1.2em", alignItems: "center" }}>
              <Alliance alliance={data.onField?.red} color={RED} mine={mine} />
              <div style={{ color: C.muted, fontWeight: 800, fontSize: "1.4em" }}>vs</div>
              <Alliance alliance={data.onField?.blue} color={BLUE} mine={mine} />
            </div>
            {lastMatch}
          </section>
          <Side>
            {following}
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
