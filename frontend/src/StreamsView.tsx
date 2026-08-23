import { useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";
import type { StreamLayout, StreamSlot } from "./settingsTypes";
import { toEmbedUrl } from "./streamEmbed";
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
  onMakeMain,
  onRemove,
}: {
  slot: StreamSlot;
  isMain: boolean;
  onMakeMain: () => void;
  onRemove: () => void;
}): ReactNode {
  return (
    <div className="stream-tile">
      <div className="stream-frame-wrap">
        <iframe
          key={slot.id}
          src={toEmbedUrl(slot.url, { muted: !isMain })}
          title={slot.label}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
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
    </div>
  );
}

export default function StreamsView({ onBack }: { onBack: () => void }) {
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

  return (
    <section className="streams-view">
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
        mainSlot && <div className="stream-solo">{tile(mainSlot)}</div>
      ) : layout === "duo" ? (
        <div className="stream-duo">
          <div className="stream-duo-primary">{tile(orderedSlots[0])}</div>
          {orderedSlots[1] && <div className="stream-duo-secondary">{tile(orderedSlots[1])}</div>}
        </div>
      ) : layout === "spotlight" ? (
        <div className="stream-spotlight">
          <div className="stream-spotlight-main">{tile(orderedSlots[0])}</div>
          {orderedSlots.length > 1 && <div className="stream-spotlight-side">{orderedSlots.slice(1, 4).map(tile)}</div>}
        </div>
      ) : layout === "quad" ? (
        <div className="stream-quad-grid">{orderedSlots.slice(0, 4).map(tile)}</div>
      ) : (
        <>
          {mainSlot && <div className="stream-main">{tile(mainSlot)}</div>}
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
    </section>
  );
}
