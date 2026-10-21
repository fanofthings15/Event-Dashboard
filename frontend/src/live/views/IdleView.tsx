import { useEffect, useState } from "react";
import type { NormalizedEvent } from "../../types";
import { formatEventTime, formatEventClock } from "../../dateFormat";
import { C, Panel, Screen, clip } from "../Screen";

function countdown(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60000));
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `in ${h}h ${mins % 60}m` : `in ${Math.floor(h / 24)}d ${h % 24}h`;
}

// Shown when nothing the display can render is live: a clock and what's
// coming up next, followed events first.
export default function IdleView({
  upcoming,
  timezone,
  metaFor,
}: {
  upcoming: NormalizedEvent[];
  timezone: string;
  metaFor: (e: NormalizedEvent) => { label: string; color: string };
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const nowIso = new Date(now).toISOString();
  return (
    <Screen label="Nothing live right now">
      <text x={400} y={120} fontSize={64} fontWeight={800} fill={C.text} textAnchor="middle">
        {formatEventClock(nowIso, timezone)}
      </text>
      <text x={400} y={156} fontSize={16} fill={C.muted} textAnchor="middle">
        Nothing live right now
      </text>
      {upcoming.length > 0 && <Panel x={120} y={190} w={560} h={upcoming.length * 56 + 24} />}
      {upcoming.map((e, i) => {
        const meta = metaFor(e);
        const y = 228 + i * 56;
        return (
          <g key={`${e.sport}-${e.id}`}>
            <rect x={140} y={y - 16} width={6} height={30} rx={2} fill={meta.color} />
            <text x={158} y={y - 2} fontSize={16} fontWeight={700} fill={C.text}>
              {e.followed || e.manuallyFollowed ? "★ " : ""}
              {clip(e.name, 40)}
            </text>
            <text x={158} y={y + 16} fontSize={12} fill={C.muted}>
              {meta.label === e.league ? meta.label : `${meta.label} · ${clip(e.league, 30)}`} · {formatEventTime(e.startTime, timezone)}
            </text>
            <text x={660} y={y + 4} fontSize={15} fontWeight={700} fill={C.accent} textAnchor="end">
              {countdown(e.startTime, now)}
            </text>
          </g>
        );
      })}
    </Screen>
  );
}
