import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "./SettingsContext";
import type { StreamLayout, StreamSlot } from "./settingsTypes";
import { toEmbedUrl, isYoutubeEmbed } from "./streamEmbed";
import { forceMaxQuality } from "./youtubeQuality";
import ConfirmDialog from "./ConfirmDialog";

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const LAYOUTS: { id: StreamLayout; label: string }[] = [
  { id: "grid", label: "Grid" },
  { id: "solo", label: "Solo" },
  { id: "duo", label: "Duo" },
  { id: "spotlight", label: "Spotlight" },
  { id: "quad", label: "Quad" },
];

function StreamTile({
  slot,
  isMain,
  hideBar,
  onMakeMain,
  onRemove,
}: {
  slot: StreamSlot;
  isMain: boolean;
  hideBar?: boolean;
  onMakeMain: () => void;
  onRemove: () => void;
}): ReactNode {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const embedUrl = toEmbedUrl(slot.url, { muted: !isMain });

  // Re-attaches every time embedUrl actually changes — toggling "Make main"
  // changes the mute param, which reloads the iframe's content and
  // invalidates whatever Player instance was watching the old load.
  useEffect(() => {
    if (!isYoutubeEmbed(embedUrl) || !iframeRef.current) return;
    return forceMaxQuality(iframeRef.current);
  }, [embedUrl]);

  return (
    <div className="stream-tile">
      <div className="stream-frame-wrap">
        <iframe
          ref={iframeRef}
          key={slot.id}
          src={embedUrl}
          title={slot.label}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
      {!hideBar && (
        <div className="stream-slot-bar">
          <span>{slot.label}</span>
          {!isMain && (
            <button className="btn small" onClick={onMakeMain}>
              Make main
            </button>
          )}
          <button className="btn-x" aria-label="Remove" onClick={onRemove}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default function StreamsView({
  mode,
  onBack,
  onExpand,
}: {
  mode: "full" | "pip";
  onBack: () => void;
  onExpand: () => void;
}) {
  const { settings, save } = useSettings();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [pendingDelete, setPendingDelete] = useState<StreamSlot | null>(null);
  const [showForm, setShowForm] = useState(false);
  // Collapses the whole controls row (back/add/layout) down to just the
  // toggle itself, for more room on a screen that's just showing streams.
  const [controlsHidden, setControlsHidden] = useState(false);

  const slots = settings.streamSlots;
  const layout = settings.streamLayout;
  const mainSlot = slots.find((s) => s.id === settings.streamMainSlotId) ?? slots[0] ?? null;
  const minorSlots = slots.filter((s) => s.id !== mainSlot?.id);
  // Main first, then the rest in their existing order — what "duo"/"quad"
  // slice from and what "grid" uses for its minor row.
  const orderedSlots = mainSlot ? [mainSlot, ...minorSlots] : slots;

  // The main slot's <iframe> lives in one DOM node that's never unmounted —
  // only ever moved (via plain appendChild, not React re-rendering) between
  // wherever it's currently docked: inline in the full layout below, or the
  // floating picture-in-picture box that hovers over every other tab. A
  // React unmount/remount would tear the iframe down and reload it from
  // scratch (losing playback position, re-muting it); a raw DOM move of an
  // already-connected node doesn't touch its content at all. `dockRef` and
  // `pipRef` are themselves never conditionally unmounted while a main slot
  // exists — only hidden via CSS — so there's always a live parent for this
  // node to be moved into.
  const portalHostRef = useRef<HTMLDivElement | null>(null);
  if (!portalHostRef.current) {
    const host = document.createElement("div");
    host.className = "stream-portal-host";
    portalHostRef.current = host;
  }
  const dockRef = useRef<HTMLDivElement | null>(null);
  const pipRef = useRef<HTMLDivElement | null>(null);

  function syncPortalHost() {
    const host = portalHostRef.current;
    if (!host) return;
    const target = mode === "pip" ? pipRef.current : dockRef.current;
    if (target && host.parentElement !== target) target.appendChild(host);
  }

  function setDockNode(el: HTMLDivElement | null) {
    dockRef.current = el;
    syncPortalHost();
  }

  function setPipNode(el: HTMLDivElement | null) {
    pipRef.current = el;
    syncPortalHost();
  }

  // Backstop: keeps the host correctly parented after any render, including
  // ones where neither dock/pip ref callback fired (e.g. only `mode`
  // changed, and both nodes were already mounted from before).
  useEffect(() => {
    syncPortalHost();
  });

  async function addSlot() {
    if (!url.trim()) return;
    const slot: StreamSlot = { id: uid(), label: label.trim() || "Stream", url: url.trim() };
    const nextSlots = [...slots, slot];
    await save({
      streamSlots: nextSlots,
      streamMainSlotId: settings.streamMainSlotId ?? slot.id,
    });
    setLabel("");
    setUrl("");
    setShowForm(false);
  }

  async function removeSlot(slot: StreamSlot) {
    const nextSlots = slots.filter((s) => s.id !== slot.id);
    const nextMain = settings.streamMainSlotId === slot.id ? (nextSlots[0]?.id ?? null) : settings.streamMainSlotId;
    await save({ streamSlots: nextSlots, streamMainSlotId: nextMain });
    setPendingDelete(null);
  }

  async function makeMain(slot: StreamSlot) {
    await save({ streamMainSlotId: slot.id });
  }

  function tile(slot: StreamSlot) {
    return (
      <StreamTile
        key={slot.id}
        slot={slot}
        isMain={slot.id === mainSlot?.id}
        onMakeMain={() => makeMain(slot)}
        onRemove={() => setPendingDelete(slot)}
      />
    );
  }

  // The dock: an always-present, empty anchor div that the main slot's
  // portal host gets docked into while browsing the full Streams view.
  // "stream-tile" gives it the same sizing treatment the layouts already
  // give a direct tile.
  const mainDock = mainSlot ? <div key="main-dock" ref={setDockNode} className="stream-tile stream-main-dock" /> : null;

  return (
    <section className={`streams-view ${mode === "full" ? "streams-view-full" : ""}`}>
      {/* Full layout — always mounted so the dock above never unmounts, just
          hidden behind the picture-in-picture box while it's active. */}
      <div className="streams-body" style={mode === "pip" ? { display: "none" } : undefined}>
        <div className={`streams-controls-row ${controlsHidden ? "collapsed" : ""}`}>
          <button
            className="btn small controls-toggle"
            onClick={() => setControlsHidden((v) => !v)}
            aria-label={controlsHidden ? "Show controls" : "Hide controls"}
          >
            {controlsHidden ? "▸" : "▾"}
          </button>
          {!controlsHidden && (
            <>
              <button className="btn small" onClick={onBack}>
                ‹ Back
              </button>
              <button className="btn small" onClick={() => setShowForm((v) => !v)}>
                {showForm ? "Close" : "+ Add stream"}
              </button>
              {slots.length > 1 && (
                <div className="layout-switcher">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      className={`btn small ${layout === l.id ? "active" : ""}`}
                      onClick={() => save({ streamLayout: l.id })}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {!controlsHidden && showForm && (
          <div className="form-row" style={{ marginBottom: 16, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Label (e.g. F1 Qualifying)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <input
              type="text"
              placeholder="Paste a stream link (YouTube, or anything else that allows embedding)…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{ flex: 1, minWidth: 260 }}
            />
            <button className="btn primary" onClick={addSlot} disabled={!url.trim()}>
              Add stream
            </button>
          </div>
        )}

        {slots.length === 0 ? (
          !showForm && <div className="empty">No streams yet — click "+ Add stream" above to get started.</div>
        ) : layout === "solo" || slots.length === 1 ? (
          <div className="stream-solo">{mainDock}</div>
        ) : layout === "duo" ? (
          <div className="stream-duo">
            <div className="stream-duo-primary">{mainDock}</div>
            {orderedSlots[1] && <div className="stream-duo-secondary">{tile(orderedSlots[1])}</div>}
          </div>
        ) : layout === "spotlight" ? (
          <div className="stream-spotlight">
            <div className="stream-spotlight-main">{mainDock}</div>
            {orderedSlots.length > 1 && <div className="stream-spotlight-side">{orderedSlots.slice(1, 4).map(tile)}</div>}
          </div>
        ) : layout === "quad" ? (
          <div className="stream-quad-grid">{orderedSlots.slice(0, 4).map((s, i) => (i === 0 ? mainDock : tile(s)))}</div>
        ) : (
          <>
            {mainSlot && <div className="stream-main">{mainDock}</div>}
            {minorSlots.length > 0 && <div className="stream-minor-grid">{minorSlots.map(tile)}</div>}
          </>
        )}

        {pendingDelete && (
          <ConfirmDialog
            title="Remove stream"
            message={`Remove "${pendingDelete.label}"?`}
            confirmLabel="Remove"
            onConfirm={() => removeSlot(pendingDelete)}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </div>

      {/* Picture-in-picture — also always mounted whenever there's a main
          slot to show, for the same reason: the moment it's hidden rather
          than unmounted, moving the portal host in and out of it never
          disturbs the iframe inside. */}
      {mainSlot && (
        <div className="stream-pip" style={mode !== "pip" ? { display: "none" } : undefined}>
          <div className="stream-pip-frame" ref={setPipNode} />
          <div className="stream-pip-bar">
            <span>{mainSlot.label}</span>
            <button className="btn small" onClick={onExpand}>
              Expand ⤢
            </button>
          </div>
        </div>
      )}

      {mainSlot &&
        createPortal(
          <StreamTile
            key={mainSlot.id}
            slot={mainSlot}
            isMain
            hideBar={mode === "pip"}
            onMakeMain={() => {}}
            onRemove={() => setPendingDelete(mainSlot)}
          />,
          portalHostRef.current!
        )}
    </section>
  );
}
