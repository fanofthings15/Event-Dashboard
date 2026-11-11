import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { StreamOption } from "../streamEmbed";
import type { Entry, StreamLayer } from "./Stream";

// One set of controls for every stream on the live display, whichever
// service it's on, drawn over the player (whose own controls are off — see
// toEmbedUrl). An invisible layer (.lv-sc-catch) covers the whole player,
// so the player never sees the mouse and none of its hover UI (YouTube's
// title and share buttons, Kick's bar) appears. It's opacity 0, not just
// transparent: Chrome doesn't count an opacity-0 layer as covering a frame,
// which matters for Twitch (GUARD_TWITCH in Stream.tsx) — there the bar and
// menus open as a drawer under the player instead of over it.
//
// What each service allows: YouTube and Twitch take play/pause, mute and
// volume as messages; Twitch also takes quality (YouTube's quality call
// does nothing any more). Kick has no player API, so it gets mute (by
// reloading the player) and fullscreen only. "<Service>'s own controls" in
// the stream menu hands the player back its controls, for anything else.

const HIDE_MS = 2500;
// a stopped stream shows the big Play button after this, so a player that
// reports "not playing" for a moment while it starts doesn't flash it
const STOPPED_MS = 2500;
// Play pressed and still not playing after this: the player is probably
// showing a prompt of its own (age check, sign-in, Twitch's small-player
// play button), so clicks go through to it until it plays
const THROUGH_MS = 3500;
// A YouTube or Twitch player that has said nothing about playing this long
// after loading is showing a screen of its own (YouTube's sign-in check
// sends no state, 2026-11-11): clicks go through to it until it plays.
// Kick never reports, so it doesn't count.
const SILENT_MS = 8000;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const PlayIcon = () => (
  <Icon>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </Icon>
);
const PauseIcon = () => (
  <Icon>
    <path d="M8 5v14M16 5v14" strokeWidth="3.2" />
  </Icon>
);
const SpeakerIcon = ({ muted }: { muted: boolean }) => (
  <Icon>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
    {muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
  </Icon>
);
const ExpandIcon = ({ out }: { out: boolean }) => (
  <Icon>{out ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}</Icon>
);
const GearIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
);
const ChevronIcon = () => (
  <Icon>
    <path d="M7 14l5-5 5 5" />
  </Icon>
);
const CheckIcon = () => (
  <Icon>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
const SlidersIcon = () => (
  <Icon>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Icon>
);

const stop = (e: React.PointerEvent) => e.stopPropagation();

export default function StreamControls({
  layer,
  entry,
  options,
  current,
  onPick,
  onUnpin,
}: {
  layer: StreamLayer;
  entry: Entry;
  options: StreamOption[];
  current?: string;
  onPick?: (url: string) => void;
  onUnpin?: () => void;
}) {
  const subscribe = useCallback((f: () => void) => layer.subscribe(entry, f), [layer, entry]);
  useSyncExternalStore(subscribe, () => entry.version);
  const v = layer.view(entry);

  const [awake, setAwake] = useState(false);
  const [overBar, setOverBar] = useState(false);
  const [menu, setMenu] = useState<null | "stream" | "quality">(null);
  const barRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastPointer = useRef<string>("mouse");
  // a tap that closes a menu does only that: its own click is let go
  const menuClosedBy = useRef<{ id: number; at: number } | null>(null);

  const wake = useCallback((ms = HIDE_MS) => {
    setAwake(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setAwake(false), ms);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  // re-render when a waiting period above runs out
  const [, setTick] = useState(0);
  const now = Date.now();
  const stopped = v.state === "paused" || v.state === "idle";
  const stoppedFor = stopped ? now - v.stateAt : 0;
  const askedFor = v.playAskedAt ? now - v.playAskedAt : 0;
  const reports = v.player === "youtube" || v.player === "twitch";
  const silentFor = reports && v.state === undefined ? now - v.stateAt : 0;
  useEffect(() => {
    const waits = [
      stopped && stoppedFor < STOPPED_MS ? STOPPED_MS - stoppedFor : 0,
      v.playAskedAt && askedFor < THROUGH_MS ? THROUGH_MS - askedFor : 0,
      silentFor > 0 && silentFor < SILENT_MS ? SILENT_MS - silentFor : 0,
    ].filter((ms) => ms > 0);
    if (!waits.length) return;
    const t = setTimeout(() => setTick((n) => n + 1), Math.min(...waits) + 30);
    return () => clearTimeout(t);
  }, [stopped, stoppedFor, askedFor, v.playAskedAt, silentFor]);

  // An open menu closes on a tap anywhere else, or Escape (before the
  // display sees Escape and takes it as Back).
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.(".lv-sc-menu, .lv-sc-menu-btn")) return;
      menuClosedBy.current = { id: e.pointerId, at: Date.now() };
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMenu(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  const canPlay = v.player !== null;
  const playing = v.state === "playing" || v.state === "buffering";
  // the player's own screen is waiting for a click: Play didn't take, it
  // reported it can't play, or it never said anything
  const through = !playing && ((Boolean(v.playAskedAt) && askedFor >= THROUGH_MS) || v.error !== undefined || silentFor >= SILENT_MS);
  const stoppedLong = canPlay && !through && stopped && (v.handPaused || stoppedFor >= STOPPED_MS);
  // a guarded player can't have the big button over it: the bar stays open instead
  const bigPlay = stoppedLong && !v.guard;
  const visible = awake || overBar || menu !== null || stoppedLong || through;
  const currentOption = options.find((o) => o.url === current) ?? options[0];
  const source = currentOption?.source ?? (v.player === "youtube" ? "YouTube" : v.player === "twitch" ? "Twitch" : "Kick");
  const volume = v.muted ? 0 : v.volume;

  // A guarded player's frame gives up the strip the open bar takes at the
  // bottom, a column at the right for an open menu (narrower than the
  // video shrinking under a tall menu), and, with its own controls on, a
  // strip at the top for the way back — so none of them overlap it.
  // (plus a pixel's gap: edges that only meet can still overlap by a pixel row
  // once they're snapped to the screen)
  useLayoutEffect(() => {
    const open = v.guard && !v.native && visible;
    // layout sizes, not on-screen ones: a phone's fullscreen box can be
    // turned on its side, which swaps an on-screen width and height
    const bar = barRef.current;
    const box = menuRef.current;
    entry.box.style.setProperty("--sc-bottom", open && bar ? `${bar.offsetHeight + 1}px` : "0px");
    entry.box.style.setProperty("--sc-right", open && box ? `${box.offsetWidth + 1}px` : "0px");
    entry.box.style.setProperty("--sc-top", v.guard && v.native ? "calc(var(--sc-top-strip) + 1px)" : "0px");
  });

  if (v.native) {
    return (
      <div className={`lv-sc native${v.guard ? " guarded" : ""}`}>
        <div className="lv-sc-top">
          <button
            className="lv-sc-btn lv-sc-back"
            aria-label="Back to the display's controls"
            title="Back to the display's controls"
            onPointerDown={stop}
            onClick={() => layer.setNative(entry, false)}
          >
            <SlidersIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`lv-sc${visible ? " on" : ""}${through ? " through" : ""}`}
      onPointerDown={(e) => {
        lastPointer.current = e.pointerType;
      }}
    >
      <div
        className="lv-sc-catch"
        onPointerMove={(e) => {
          if (e.pointerType === "mouse") wake();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && !menu) setAwake(false);
        }}
        onClick={(e) => {
          const c = menuClosedBy.current;
          const id = (e.nativeEvent as Partial<PointerEvent>).pointerId;
          menuClosedBy.current = null;
          if (menu) setMenu(null);
          else if (c && (id !== undefined && id >= 0 ? id === c.id : Date.now() - c.at < 400)) return;
          else if (lastPointer.current !== "mouse" && awake) setAwake(false);
          else wake(lastPointer.current === "mouse" ? HIDE_MS : 4000);
        }}
        onDoubleClick={() => {
          if (lastPointer.current === "mouse") layer.toggleFullscreen(entry);
        }}
      />
      {bigPlay && (
        <button className="lv-sc-big" aria-label="Play" onPointerDown={stop} onClick={() => layer.togglePlay(entry)}>
          <PlayIcon />
        </button>
      )}
      <div
        ref={barRef}
        className="lv-sc-bar"
        onPointerDown={stop}
        onPointerEnter={(e) => e.pointerType === "mouse" && setOverBar(true)}
        onPointerLeave={() => setOverBar(false)}
        onClick={() => lastPointer.current !== "mouse" && wake(4000)}
      >
        {canPlay && (
          <button className="lv-sc-btn" aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"} onClick={() => layer.togglePlay(entry)}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
        )}
        <button className="lv-sc-btn" aria-label={v.muted ? "Unmute" : "Mute"} title={v.muted ? "Unmute" : "Mute"} onClick={() => layer.setMuted(entry, !v.muted)}>
          <SpeakerIcon muted={v.muted} />
        </button>
        {canPlay && (
          <input
            className="lv-sc-vol"
            type="range"
            min={0}
            max={100}
            step={1}
            value={volume}
            aria-label="Volume"
            style={{ ["--v" as string]: `${volume}%` }}
            onChange={(e) => layer.setVolume(entry, Number(e.target.value))}
          />
        )}
        <span className="lv-sc-gap" />
        {onUnpin && (
          <button className="lv-sc-src lv-sc-pin" aria-label="Unpin" title="Unpin — let the display pick this spot again" onClick={onUnpin}>
            Pinned ✕
          </button>
        )}
        <button
          className="lv-sc-src lv-sc-menu-btn"
          aria-haspopup="menu"
          aria-expanded={menu === "stream"}
          title="Stream"
          onClick={() => setMenu(menu === "stream" ? null : "stream")}
        >
          <span className="lv-sc-src-name">{currentOption?.label ?? source}</span>
          <ChevronIcon />
        </button>
        {v.qualities.length > 0 && (
          <button
            className="lv-sc-btn lv-sc-menu-btn"
            aria-label="Quality"
            title="Quality"
            aria-haspopup="menu"
            aria-expanded={menu === "quality"}
            onClick={() => setMenu(menu === "quality" ? null : "quality")}
          >
            <GearIcon />
          </button>
        )}
        <button
          className="lv-sc-btn"
          aria-label={v.fullscreen ? "Exit fullscreen" : "Fullscreen"}
          aria-keyshortcuts="F"
          title={v.fullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
          onClick={() => layer.toggleFullscreen(entry)}
        >
          <ExpandIcon out={v.fullscreen} />
        </button>

        {menu === "stream" && (
          <div ref={menuRef} className="lv-sc-menu" role="menu" aria-label="Stream">
            {options.map((o) => (
              <button
                key={o.url}
                role="menuitemradio"
                aria-checked={o === currentOption}
                onClick={() => {
                  setMenu(null);
                  if (o !== currentOption) onPick?.(o.url);
                }}
              >
                <span className="lv-sc-check">{o === currentOption && <CheckIcon />}</span>
                {o.label}
              </button>
            ))}
            <span className="lv-sc-sep" role="separator" />
            {currentOption && (
              <a role="menuitem" href={currentOption.url} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(null)}>
                <span className="lv-sc-check" />
                Open on {source} ↗
              </a>
            )}
            <button
              role="menuitem"
              onClick={() => {
                setMenu(null);
                layer.setNative(entry, true);
              }}
            >
              <span className="lv-sc-check" />
              {source}'s own controls
            </button>
          </div>
        )}
        {menu === "quality" && (
          <div ref={menuRef} className="lv-sc-menu" role="menu" aria-label="Quality">
            {[{ group: "auto", name: "Auto" }, ...v.qualities].map((q) => (
              <button
                key={q.group}
                role="menuitemradio"
                aria-checked={(v.quality ?? "auto") === q.group}
                onClick={() => {
                  setMenu(null);
                  layer.setQuality(entry, q.group);
                }}
              >
                <span className="lv-sc-check">{(v.quality ?? "auto") === q.group && <CheckIcon />}</span>
                {q.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
