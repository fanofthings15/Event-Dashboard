import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { NormalizedEvent } from "../../types";
import { formatEventClock } from "../../dateFormat";

// When it starts: a countdown within the day, then the weekday and time,
// then the date and time beyond a week ("in 3h 20m", "Thu 7:00 PM",
// "Nov 20 7:00 PM").
function when(iso: string, now: number, timezone: string): string {
  const ms = new Date(iso).getTime() - now;
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `in ${mins} min`;
  if (mins < 24 * 60) return `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  const tz = timezone ? { timeZone: timezone } : {};
  const day =
    ms < 6 * 24 * 3600_000
      ? new Date(iso).toLocaleDateString(undefined, { weekday: "short", ...tz })
      : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", ...tz });
  return `${day} ${formatEventClock(iso, timezone)}`;
}

type Meta = (e: NormalizedEvent) => { label: string; color: string };

function Row({ e, metaFor, right, rightColor, star }: { e: NormalizedEvent; metaFor: Meta; right: string; rightColor?: string; star: boolean }) {
  const meta = metaFor(e);
  return (
    <div className="lv-idle-row">
      <span className="bar" style={{ background: meta.color }} />
      <span style={{ minWidth: 0 }}>
        <div className="name">
          {star && (e.followed || e.manuallyFollowed) ? "★ " : ""}
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

function usePortrait(): boolean {
  const q = "(max-aspect-ratio: 1/1)";
  const [on, setOn] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const update = () => setOn(m.matches);
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return on;
}

// One column: as many rows as fit its height, the rest counted in the
// heading ("+4 more"). Where the columns stack (portrait, a phone) a column
// is as tall as its rows and the screen scrolls; there it shows at most
// `phoneMax` rows, so the lists below it aren't a long scroll away.
function Column({ title, className, phoneMax, children: all }: { title: string; className: string; phoneMax?: number; children: React.ReactNode[] }) {
  const portrait = usePortrait();
  const children = portrait && phoneMax !== undefined ? all.slice(0, phoneMax) : all;
  const list = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(children.length);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const measure = () => {
      let n = 0;
      for (const row of el.children as HTMLCollectionOf<HTMLElement>) {
        if (row.offsetTop + row.offsetHeight > el.clientHeight + 1) break;
        n++;
      }
      setFit(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children.length]);
  const more = all.length - Math.min(fit, children.length);
  return (
    <div className={`lv-upcoming ${className}`}>
      <div className="lv-label lv-idle-head">
        <span>{title}</span>
        {more > 0 && <span className="lv-idle-more">+{more} more</span>}
      </div>
      <div className="lv-idle-rows" ref={list}>
        {children.map((c, i) => (
          <div key={i} className="lv-idle-slot" style={i >= fit ? { visibility: "hidden" } : undefined}>
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}

// Shown when nothing the display can render is live: a clock and three
// columns — recent final scores, the user's followed games coming up, and
// everything else coming up, each soonest first (the user's layout,
// 2026-11-11: with more than five follows, a single "Up next" list of five,
// followed first, hid what was actually on next).
export default function IdleView({
  finished,
  yours,
  upcoming,
  timezone,
  metaFor,
}: {
  finished: NormalizedEvent[];
  yours: NormalizedEvent[];
  upcoming: NormalizedEvent[];
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
          <Column title="Final" className="lv-idle-final" phoneMax={5}>
            {finished.map((e) => (
              <Row key={`${e.sport}-${e.id}`} e={e} metaFor={metaFor} right={e.seriesScore ?? "Final"} rightColor="var(--text)" star />
            ))}
          </Column>
        )}
        {yours.length > 0 && (
          <Column title="Your games" className="lv-idle-yours">
            {yours.map((e) => (
              <Row key={`${e.sport}-${e.id}`} e={e} metaFor={metaFor} right={when(e.startTime, now, timezone)} star={false} />
            ))}
          </Column>
        )}
        {upcoming.length > 0 && (
          <Column title="Up next" className="lv-idle-next" phoneMax={10}>
            {upcoming.map((e) => (
              <Row key={`${e.sport}-${e.id}`} e={e} metaFor={metaFor} right={when(e.startTime, now, timezone)} star={false} />
            ))}
          </Column>
        )}
      </div>
    </div>
  );
}
