import type { BaseballState } from "../liveTypes";
import { teamColors } from "../teamColors";
import { C, Footer, Header, Label, Panel, Screen, ScoreLine, clip } from "../Screen";

// ESPN pitch coordinates are gamecast pixels, not real units. The strike
// zone box below (x 82..145, y 146..194) is what separated called strikes
// from balls in 541 recent pitches — see backend/src/liveEspn.ts.
const ZONE = { x0: 82, x1: 145, y0: 146, y1: 194 };
const SPACE = { x0: 40, x1: 190, y0: 100, y1: 250 }; // pitch-space window drawn
const PANEL = { x: 414, y: 108, w: 136, h: 136 };
const mapX = (x: number) => PANEL.x + ((x - SPACE.x0) / (SPACE.x1 - SPACE.x0)) * PANEL.w;
const mapY = (y: number) => PANEL.y + ((y - SPACE.y0) / (SPACE.y1 - SPACE.y0)) * PANEL.h;

function pitchColor(result: string): string {
  if (/ball/i.test(result) && !/foul/i.test(result)) return C.green;
  if (/strike|foul|swinging/i.test(result)) return C.live;
  return C.accent; // put in play
}

export default function BaseballView({ data, leagueColor }: { data: BaseballState; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const hx = 200;
  const hy = 420;

  const base = (x: number, y: number, on: boolean) => (
    <rect
      x={x - 8}
      y={y - 8}
      width={16}
      height={16}
      transform={`rotate(45 ${x} ${y})`}
      fill={on ? C.yellow : "#fff"}
      fillOpacity={on ? 1 : 0.25}
      stroke={on ? C.yellow : "#fff"}
      strokeWidth={1.5}
    />
  );
  const dots = (y: number, label: string, n: number, total: number, color: string) => (
    <g>
      <text x={30} y={y + 4} fontSize={13} fontWeight={700} fill={C.muted}>
        {label}
      </text>
      {Array.from({ length: total }, (_, i) => (
        <circle key={i} cx={62 + i * 18} cy={y} r={6} fill={i < n ? color : "none"} stroke={color} strokeWidth={1.5} />
      ))}
    </g>
  );

  const innings = Math.max(9, away?.linescores.length ?? 0, home?.linescores.length ?? 0);
  const colW = Math.min(22, 200 / innings);
  const zx0 = mapX(ZONE.x0);
  const zy0 = mapY(ZONE.y0);
  const zw = mapX(ZONE.x1) - zx0;
  const zh = mapY(ZONE.y1) - zy0;

  return (
    <Screen label="MLB live diamond view">
      <Header
        league="MLB"
        leagueColor={leagueColor}
        live={data.state === "in"}
        centre={<ScoreLine away={away} home={home} awayColor={awayColor} homeColor={homeColor} />}
        right={data.state === "in" && data.inning ? data.inning : data.detail}
      />
      <path d={`M${hx} ${hy} L${hx - 168} ${hy - 168} A238 238 0 0 1 ${hx + 168} ${hy - 168} Z`} fill="#1f4d2c" />
      <polygon points={`${hx},${hy + 12} ${hx + 98},${hy - 86} ${hx},${hy - 184} ${hx - 98},${hy - 86}`} fill="#6b4a2e" />
      <polygon points={`${hx},${hy - 14} ${hx + 70},${hy - 86} ${hx},${hy - 156} ${hx - 70},${hy - 86}`} fill="#1f4d2c" />
      <circle cx={hx} cy={hy - 86} r={10} fill="#6b4a2e" />
      <line x1={hx} y1={hy} x2={hx - 168} y2={hy - 168} stroke="#fff" strokeOpacity={0.6} />
      <line x1={hx} y1={hy} x2={hx + 168} y2={hy - 168} stroke="#fff" strokeOpacity={0.6} />
      {base(hx + 84, hy - 86, data.onFirst)}
      {base(hx, hy - 170, data.onSecond)}
      {base(hx - 84, hy - 86, data.onThird)}
      <path d={`M${hx - 7} ${hy - 8} h14 v6 l-7 7 l-7 -7 z`} fill="#fff" />

      {dots(92, "B", data.balls, 4, C.green)}
      {dots(116, "S", data.strikes, 3, C.live)}
      {dots(140, "O", data.outs, 3, C.yellow)}

      <Panel x={400} y={72} w={164} h={260} />
      <Label x={414} y={96}>
        THIS AT-BAT
      </Label>
      <rect x={zx0} y={zy0} width={zw} height={zh} fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={1.5} />
      {[1, 2].map((k) => (
        <g key={k}>
          <line x1={zx0 + (zw * k) / 3} x2={zx0 + (zw * k) / 3} y1={zy0} y2={zy0 + zh} stroke="#fff" strokeOpacity={0.15} />
          <line x1={zx0} x2={zx0 + zw} y1={zy0 + (zh * k) / 3} y2={zy0 + (zh * k) / 3} stroke="#fff" strokeOpacity={0.15} />
        </g>
      ))}
      {data.pitches.map((p, i) => (
        <g key={i}>
          <circle cx={mapX(p.x)} cy={mapY(p.y)} r={9} fill={pitchColor(p.result)} stroke={C.bg} strokeWidth={1.5} />
          <text x={mapX(p.x)} y={mapY(p.y) + 4} fontSize={10} fontWeight={800} fill={C.bg} textAnchor="middle">
            {i + 1}
          </text>
        </g>
      ))}
      <text x={414} y={318} fontSize={10} fill={C.muted}>
        <tspan fill={C.green}>●</tspan> ball <tspan fill={C.live}>●</tspan> strike <tspan fill={C.accent}>●</tspan> in play
      </text>

      <Panel x={578} y={72} w={206} h={260} />
      <Label x={592} y={96}>
        MATCHUP
      </Label>
      <text x={592} y={118} fontSize={12.5} fontWeight={600} fill={C.text}>
        {clip(data.matchup, 30)}
      </text>
      {data.pitches.slice(-6).map((p, i, arr) => (
        <g key={i}>
          <text x={592} y={150 + i * 24} fontSize={12} fill={C.text}>
            {data.pitches.length - arr.length + i + 1} {clip(p.type, 14)} {p.mph ? `${p.mph}` : ""}
          </text>
          <text x={770} y={150 + i * 24} fontSize={12} fill={pitchColor(p.result)} textAnchor="end">
            {clip(p.result, 14)}
          </text>
        </g>
      ))}

      <Panel x={400} y={344} w={384} h={112} />
      {Array.from({ length: innings }, (_, i) => (
        <text key={i} x={470 + i * colW} y={368} fontSize={11} fill={C.muted} textAnchor="middle">
          {i + 1}
        </text>
      ))}
      {["R", "H", "E"].map((h, i) => (
        <text key={h} x={686 + i * 30} y={368} fontSize={11} fontWeight={700} fill={C.muted} textAnchor="middle">
          {h}
        </text>
      ))}
      {[away, home].map((t, k) => {
        const y = 396 + k * 30;
        return (
          <g key={k}>
            <text x={414} y={y} fontSize={13} fontWeight={800} fill={k ? homeColor : awayColor}>
              {t?.abbr}
            </text>
            {Array.from({ length: innings }, (_, i) => (
              <text key={i} x={470 + i * colW} y={y} fontSize={12} fill={C.text} textAnchor="middle">
                {t?.linescores[i] ?? ""}
              </text>
            ))}
            {[t?.score, t?.hits, t?.errors].map((v, i) => (
              <text key={i} x={686 + i * 30} y={y} fontSize={13} fontWeight={800} fill={C.text} textAnchor="middle">
                {v ?? "–"}
              </text>
            ))}
          </g>
        );
      })}

      <text x={30} y={176} fontSize={12} fill={C.muted}>
        {clip(data.lastPlay, 44)}
      </text>
      <Footer>ESPN gamecast · pitch locations approximate</Footer>
    </Screen>
  );
}
