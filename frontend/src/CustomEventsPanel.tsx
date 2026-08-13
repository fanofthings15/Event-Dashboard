import { useState } from "react";
import { useSettings } from "./SettingsContext";
import type { CustomEvent } from "./settingsTypes";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  onClose: () => void;
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const EMPTY_FORM = { name: "", league: "", color: "#94a3b8", startTime: "", url: "", hours: 2, minutes: 0 };

export default function CustomEventsPanel({ onClose }: Props) {
  const { settings, save } = useSettings();
  const [form, setForm] = useState(EMPTY_FORM);
  const [pendingDelete, setPendingDelete] = useState<CustomEvent | null>(null);

  async function addCustomEvent() {
    if (!form.name || !form.startTime) return;
    const event: CustomEvent = {
      id: uid(),
      name: form.name,
      league: form.league || "Custom",
      color: form.color,
      startTime: new Date(form.startTime).toISOString(),
      durationMinutes: form.hours * 60 + form.minutes,
      url: form.url || undefined,
    };
    await save({ customEvents: [...settings.customEvents, event] });
    setForm(EMPTY_FORM);
  }

  async function confirmRemove() {
    if (!pendingDelete) return;
    await save({ customEvents: settings.customEvents.filter((e) => e.id !== pendingDelete.id) });
    setPendingDelete(null);
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Custom events</h2>
        <span className="hint">
          Manually add anything not covered by a data source. Saved locally — survives code updates and redeploys.
        </span>

        {settings.customEvents.length > 0 && (
          <ul className="custom-event-list" style={{ marginTop: 12 }}>
            {settings.customEvents.map((e) => (
              <li key={e.id}>
                <span className="dot" style={{ background: e.color }} />
                <span className="custom-event-name">{e.name}</span>
                <span className="hint">{new Date(e.startTime).toLocaleString()}</span>
                <button className="btn-x" onClick={() => setPendingDelete(e)} aria-label="Remove">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="custom-event-form">
          <input
            className="text-input"
            placeholder="Event name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="text-input"
            placeholder="League / category (optional)"
            value={form.league}
            onChange={(e) => setForm({ ...form, league: e.target.value })}
          />
          <input
            className="text-input"
            placeholder="Link (optional) — stream, tickets, etc."
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
          <div className="form-row">
            <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            <input
              type="datetime-local"
              className="text-input"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </div>
          <label className="field">
            <span>Duration — how long it counts as "live"</span>
            <div className="form-row">
              <input
                type="number"
                className="text-input"
                min={0}
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
                placeholder="Hours"
              />
              <input
                type="number"
                className="text-input"
                min={0}
                max={59}
                value={form.minutes}
                onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}
                placeholder="Minutes"
              />
            </div>
          </label>
          <button className="btn primary" onClick={addCustomEvent} disabled={!form.name || !form.startTime}>
            Add event
          </button>
        </div>

        <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>
          Done
        </button>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Remove event?"
          message={`"${pendingDelete.name}" will be removed for good.`}
          confirmLabel="Remove"
          onConfirm={confirmRemove}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
