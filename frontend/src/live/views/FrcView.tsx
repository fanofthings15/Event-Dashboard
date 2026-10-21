import type { FrcAlliance, FrcState } from "../liveTypes";
import { C, Footer, Header, Label, Panel, Screen, clip } from "../Screen";

const RED = "#ef4444";
const BLUE = "#3b82f6";

function minutesUntil(unixSeconds?: number): string | undefined {
  if (!unixSeconds) return undefined;
  const mins = Math.round((unixSeconds * 1000 - Date.now()) / 60000);
  if (mins <= 0) return "now";
  return mins < 60 ? `in ~${mins} min` : `in ~${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function TeamPills({ alliance, color, x, mine }: { alliance?: FrcAlliance; color: string; x: number; mine?: string }) {
  return (
    <g>
      {(alliance?.teams ?? []).map((t, i) => {
        const me = t === mine;
        return (
          <g key={t}>
            <rect x={x} y={116 + i * 50} width={86} height={34} rx={6} fill={color} fillOpacity={me ? 0.9 : 0.25} stroke={color} strokeWidth={me ? 2.5 : 1} />
            <text x={x + 43} y={139 + i * 50} fontSize={16} fontWeight={800} fill={me ? "#fff" : C.text} textAnchor="middle">
              {me ? `★ ${t}` : t}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export default function FrcView({ data, eventName, leagueColor }: { data: FrcState; eventName: string; leagueColor: string }) {
  const mine = data.myTeam?.number;
  const last = data.last;
  const total = (last?.red.score ?? 0) + (last?.blue.score ?? 0);
  const redW = total > 0 ? (528 * (last?.red.score ?? 0)) / total : 264;

  return (
    <Screen label="FRC live event view">
      <Header
        league="FRC"
        leagueColor={leagueColor}
        centre={
          <text x={400} y={36} fontSize={17} fontWeight={700} fill={C.text} textAnchor="middle">
            {clip(data.eventName ?? eventName, 40)}
          </text>
        }
        right={data.onField?.label ?? ""}
      />
      {data.error ? (
        <text x={400} y={260} fontSize={16} fill={C.muted} textAnchor="middle">
          {data.error}
        </text>
      ) : (
        <g>
          <text x={300} y={94} fontSize={14} fontWeight={800} fill={C.text} textAnchor="middle" letterSpacing={0.8}>
            {data.onField ? `UP NOW · ${data.onField.label.toUpperCase()}` : "NO MATCH QUEUED"}
          </text>
          <rect x={122} y={106} width={356} height={200} rx={12} fill="#1a1f27" stroke="#3a404c" strokeWidth={2} />
          <line x1={300} x2={300} y1={106} y2={306} stroke="#3a404c" strokeWidth={2} strokeDasharray="8 6" />
          <rect x={122} y={106} width={40} height={200} fill={RED} fillOpacity={0.14} />
          <rect x={438} y={106} width={40} height={200} fill={BLUE} fillOpacity={0.14} />
          <circle cx={300} cy={206} r={34} fill="none" stroke="#3a404c" strokeWidth={2} />
          <TeamPills alliance={data.onField?.red} color={RED} x={26} mine={mine} />
          <TeamPills alliance={data.onField?.blue} color={BLUE} x={488} mine={mine} />
          {data.onField?.time && (
            <text x={300} y={326} fontSize={12} fill={C.muted} textAnchor="middle">
              Scheduled {minutesUntil(data.onField.time)}
            </text>
          )}

          <Panel x={20} y={340} w={560} h={112} />
          <Label x={36} y={364}>
            {last ? `LAST MATCH · ${last.label.toUpperCase()}` : "NO MATCHES PLAYED YET"}
          </Label>
          {last && (
            <g>
              <rect x={36} y={378} width={redW} height={26} rx={4} fill={RED} />
              <rect x={36 + redW} y={378} width={528 - redW} height={26} rx={4} fill={BLUE} />
              <text x={46} y={396} fontSize={14} fontWeight={800} fill="#fff">
                Red {last.red.score ?? "–"}
              </text>
              <text x={554} y={396} fontSize={14} fontWeight={800} fill="#fff" textAnchor="end">
                {last.blue.score ?? "–"} Blue
              </text>
              <text x={36} y={432} fontSize={12} fill={C.muted}>
                Red: {last.red.teams.join(" · ")}   Blue: {last.blue.teams.join(" · ")}
                {last.winner ? `   · ${last.winner === "red" ? "Red" : "Blue"} wins` : ""}
              </text>
            </g>
          )}

          <Panel x={596} y={72} w={188} h={380} />
          {data.myTeam ? (
            <g>
              <Label x={610} y={96}>
                FOLLOWING
              </Label>
              <text x={610} y={122} fontSize={22} fontWeight={800} fill={C.accent}>
                ★ {data.myTeam.number}
              </text>
              <text x={610} y={150} fontSize={13} fill={C.text}>
                {data.myTeam.next ? `Next: ${data.myTeam.next.label} · ${data.myTeam.next.alliance === "red" ? "Red" : "Blue"}` : "No more matches scheduled"}
              </text>
              {data.myTeam.next?.time && (
                <text x={610} y={172} fontSize={13} fontWeight={700} fill={C.text}>
                  {minutesUntil(data.myTeam.next.time)}
                </text>
              )}
              {data.myTeam.rank && (
                <text x={610} y={202} fontSize={13} fill={C.text}>
                  Rank {data.myTeam.rank}
                  {data.myTeam.rankedTeams ? ` of ${data.myTeam.rankedTeams}` : ""}
                  {data.myTeam.record ? ` · ${data.myTeam.record}` : ""}
                </text>
              )}
              <line x1={610} x2={770} y1={222} y2={222} stroke={C.border} />
            </g>
          ) : null}
          <Label x={610} y={data.myTeam ? 250 : 96}>
            RANKINGS
          </Label>
          {(data.rankings ?? []).map((r, i) => {
            const y = (data.myTeam ? 276 : 122) + i * 20;
            const me = r.team === mine;
            return (
              <g key={r.team}>
                {me && <rect x={604} y={y - 14} width={176} height={19} rx={3} fill={C.accent} fillOpacity={0.22} />}
                <text x={626} y={y} fontSize={12} fill={C.muted} textAnchor="end">
                  {r.rank}
                </text>
                <text x={640} y={y} fontSize={13} fontWeight={me ? 800 : 600} fill={C.text}>
                  {r.team}
                </text>
                <text x={770} y={y} fontSize={12} fill={C.muted} textAnchor="end">
                  {r.record ?? ""}
                </text>
              </g>
            );
          })}
        </g>
      )}
      <Footer>The Blue Alliance · scores post after each match</Footer>
    </Screen>
  );
}
