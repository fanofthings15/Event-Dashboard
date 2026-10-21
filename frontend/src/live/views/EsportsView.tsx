import type { NormalizedEvent } from "../../types";
import type { CropRect } from "../../settingsTypes";
import StreamCrop from "../StreamCrop";
import { C, Footer, Header, Label, Panel, clip } from "../Screen";

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

const TEAM_COLORS = [C.accent, C.live];

// Esports views are part HTML (the stream iframe) and part SVG, so they lay
// out on a 16:10 stage with the iframe positioned in the same 800×500 units
// the SVG overlay uses.
export default function EsportsView({
  event,
  label,
  leagueColor,
  mode,
  stream,
  crop,
}: {
  event: NormalizedEvent;
  label: string;
  leagueColor: string;
  mode: "crop" | "series";
  stream: { embed: string; source: string } | null;
  crop: CropRect | undefined;
}) {
  const teams = event.teams ?? [];
  const { wins, bestOf } = parseSeries(event.seriesScore);
  const needed = bestOf ? Math.ceil(bestOf / 2) : undefined;
  const crop_ = mode === "crop";
  const streamBox = crop_ ? { x: 24, y: 72, w: 400, h: 400 } : { x: 20, y: 72, w: 480, h: 270 };
  const panelX = crop_ ? 440 : 512;
  const panelW = 784 - panelX;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <>
      <div
        className="live-stream-slot"
        style={{ left: pct(streamBox.x, 800), top: pct(streamBox.y, 500), width: pct(streamBox.w, 800), height: pct(streamBox.h, 500) }}
      >
        {stream ? <StreamCrop embed={stream.embed} crop={crop_ ? crop ?? null : null} /> : null}
      </div>
      <svg className="live-svg live-overlay" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${label} live view`}>
        <Header
          league={label}
          leagueColor={leagueColor}
          centre={
            <text x={400} y={37} fontSize={20} fontWeight={800} fill={C.text} textAnchor="middle">
              <tspan fill={TEAM_COLORS[0]}>{clip(teams[0]?.name, 16)}</tspan>
              {wins ? `  ${wins[0]} – ${wins[1]}  ` : "  vs  "}
              <tspan fill={TEAM_COLORS[1]}>{clip(teams[1]?.name, 16)}</tspan>
            </text>
          }
          right={clip(event.league, 22)}
        />
        {!stream && (
          <g>
            <rect x={streamBox.x} y={streamBox.y} width={streamBox.w} height={streamBox.h} rx={8} fill={C.panel} stroke={C.border} />
            <text x={streamBox.x + streamBox.w / 2} y={streamBox.y + streamBox.h / 2} fontSize={14} fill={C.muted} textAnchor="middle">
              No embeddable stream for this match
            </text>
          </g>
        )}
        {stream && (
          <g>
            <rect x={streamBox.x + 8} y={streamBox.y + 8} width={stream.source.length * 8 + 84} height={20} rx={4} fill="#000" fillOpacity={0.7} />
            <circle cx={streamBox.x + 18} cy={streamBox.y + 18} r={3.5} fill={C.live} />
            <text x={streamBox.x + 26} y={streamBox.y + 22} fontSize={11} fontWeight={700} fill="#fff">
              STREAM · {stream.source}
            </text>
          </g>
        )}

        <Panel x={panelX} y={72} w={panelW} h={400} />
        <Label x={panelX + 16} y={98}>
          {bestOf ? `SERIES · BEST OF ${bestOf}` : "MATCH"}
        </Label>
        {teams.slice(0, 2).map((t, i) => {
          const y = 132 + i * 64;
          return (
            <g key={i}>
              {t.imageUrl ? (
                <image href={t.imageUrl} x={panelX + 16} y={y - 24} width={40} height={40} preserveAspectRatio="xMidYMid meet" />
              ) : (
                <circle cx={panelX + 36} cy={y - 4} r={18} fill={TEAM_COLORS[i]} fillOpacity={0.3} />
              )}
              <text x={panelX + 66} y={y + 2} fontSize={17} fontWeight={800} fill={TEAM_COLORS[i]}>
                {clip(t.name, crop_ ? 18 : 12)}
              </text>
              {wins && (
                <text x={panelX + panelW - 16} y={y + 4} fontSize={30} fontWeight={800} fill={C.text} textAnchor="end">
                  {wins[i]}
                </text>
              )}
              {needed &&
                Array.from({ length: needed }, (_, k) => (
                  <circle
                    key={k}
                    cx={panelX + 70 + k * 14}
                    cy={y + 18}
                    r={5}
                    fill={wins && k < wins[i] ? TEAM_COLORS[i] : "none"}
                    stroke={TEAM_COLORS[i]}
                    strokeWidth={1.5}
                  />
                ))}
            </g>
          );
        })}
        <line x1={panelX + 16} x2={panelX + panelW - 16} y1={244} y2={244} stroke={C.border} />
        <Label x={panelX + 16} y={272}>
          LEAGUE
        </Label>
        <text x={panelX + 16} y={296} fontSize={15} fontWeight={600} fill={C.text}>
          {clip(event.league, crop_ ? 34 : 26)}
        </text>
        {wins && needed && (
          <text x={panelX + 16} y={330} fontSize={13} fill={C.muted}>
            {wins[0] === wins[1]
              ? `Level at ${wins[0]}–${wins[1]}`
              : `${clip(teams[wins[0] > wins[1] ? 0 : 1]?.name, 16)} needs ${needed - Math.max(...wins)} more`}
          </text>
        )}
        <Footer>
          PandaScore series score{stream ? ` · ${crop_ ? "minimap cropped from the" : "picture-in-picture"} ${stream.source} stream` : ""}
          {crop_ && stream ? " · press C to adjust the crop" : ""}
        </Footer>
      </svg>
    </>
  );
}
