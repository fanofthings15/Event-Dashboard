import { useState } from "react";
import { useSettings } from "./SettingsContext";
import type { StreamSlot } from "./settingsTypes";
import { toEmbedUrl } from "./streamEmbed";
import ConfirmDialog from "./ConfirmDialog";

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function StreamsView() {
  const { settings, save } = useSettings();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [pendingDelete, setPendingDelete] = useState<StreamSlot | null>(null);

  const slots = settings.streamSlots;
  const mainSlot = slots.find((s) => s.id === settings.streamMainSlotId) ?? slots[0] ?? null;
  const minorSlots = slots.filter((s) => s.id !== mainSlot?.id);

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

  return (
    <section className="streams-view">
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
          placeholder="Paste a YouTube (or other embeddable) stream link…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ flex: 1, minWidth: 260 }}
        />
        <button className="btn primary" onClick={addSlot} disabled={!url.trim()}>
          Add stream
        </button>
      </div>

      {slots.length === 0 ? (
        <div className="empty">No streams yet — paste a link above to get started.</div>
      ) : (
        <>
          {mainSlot && (
            <div className="stream-main">
              <div className="stream-frame-wrap">
                <iframe
                  key={mainSlot.id}
                  src={toEmbedUrl(mainSlot.url)}
                  title={mainSlot.label}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
              <div className="stream-slot-bar">
                <span>{mainSlot.label}</span>
                <button className="btn-x" aria-label="Remove" onClick={() => setPendingDelete(mainSlot)}>
                  ×
                </button>
              </div>
            </div>
          )}

          {minorSlots.length > 0 && (
            <div className="stream-minor-grid">
              {minorSlots.map((slot) => (
                <div key={slot.id} className="stream-minor">
                  <div className="stream-frame-wrap">
                    <iframe
                      src={toEmbedUrl(slot.url)}
                      title={slot.label}
                      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                      allowFullScreen
                    />
                  </div>
                  <div className="stream-slot-bar">
                    <span>{slot.label}</span>
                    <button className="btn small" onClick={() => makeMain(slot)}>
                      Make main
                    </button>
                    <button className="btn-x" aria-label="Remove" onClick={() => setPendingDelete(slot)}>
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
