import { useEffect, useState } from "react";
import type { NormalizedEvent } from "../../types";
import { formatEventClock } from "../../dateFormat";

function countdown(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60000));
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `in ${h}h ${mins % 60}m` : `in ${Math.floor(h / 24)}d ${h % 24}h`;
}

type Meta = (e: NormalizedEvent) => { label: string; color: string };

function Row({ e, metaFor, right, rightColor }: { e: NormalizedEvent; metaFor: Meta; right: string; rightColor?: string }) {
  const meta = metaFor(e);
  return (
    <div>
      <span className="bar" style={{ background: meta.color }} />
      <span style={{ minWidth: 0 }}>
        <div className="name">
          {e.followed || e.manuallyFollowed ? "★ " : ""}
          {e.name}
        </div>
        <div className="meta">{meta.label === e.league ? meta.label : `${meta.label} · ${e.league}`}</div>
      </span>
      <span className="when" style={rightColor ? { color: rightColor } : undefined}>
        {right}
      </span>
    </div>
  );
}

// Shown when nothing the display can render is live: a clock, recent final
// scores and what's coming up next (followed events first in both).
export default function IdleView({
  upcoming,
  finished,
  timezone,
  metaFor,
}: {
  upcoming: NormalizedEvent[];
  finished: NormalizedEvent[];
  timezone: string;
  metaFor: Meta;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="lv lv-idle">
      <div className="lv-clock">{formatEventClock(new Date(now).toISOString(), timezone)}</div>
      <div className="lv-idle-cols">
        {finished.length > 0 && (
          <div className="lv-upcoming">
            <div className="lv-label lv-idle-head">Final</div>
            {finished.map((e) => (
              <Row key={`${e.sport}-${e.id}`} e={e} metaFor={metaFor} right={e.seriesScore ?? "Final"} rightColor="var(--text)" />
            ))}
          </div>
        )}
        {upcoming.length > 0 && (
          <div className="lv-upcoming">
            <div className="lv-label lv-idle-head">Up next</div>
            {upcoming.map((e) => (
              <Row key={`${e.sport}-${e.id}`} e={e} metaFor={metaFor} right={countdown(e.startTime, now)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
