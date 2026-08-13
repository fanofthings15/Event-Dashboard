import { useState } from "react";
import { useSettings } from "./useSettings";
import type { CustomEvent } from "./settingsTypes";

interface Props {
  onClose: () => void;
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function CustomEventsPanel({ onClose }: Props) {
  const { settings, save } = useSettings();
  const [form, setForm] = useState({
    name: "",
    league: "",
    color: "#94a3b8",
    startTime: "",
    durationMinutes: 120,
  });

  async function addCustomEvent() {
    if (!form.name || !form.startTime) return;
    const event: CustomEvent = {
      id: uid(),
      name: form.name,
      league: form.league || "Custom",
      color: form.color,
      startTime: new Date(form.startTime).toISOString(),
      durationMinutes: form.durationMinutes,
    };
    await save({ customEvents: [...settings.customEvents, event] });
    setForm({ name: "", league: "", color: "#94a3b8", startTime: "", durationMinutes: 120 });
  }

  async function removeCustomEvent(id: string) {
    await save({ customEvents: settings.customEvents.filter((e) => e.id !== id) });
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
                <button className="btn-x" onClick={() => removeCustomEvent(e.id)} aria-label="Remove">
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
            <span>Duration (minutes) — how long it counts as "live"</span>
            <input
              type="number"
              className="text-input"
              min={5}
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
            />
          </label>
          <button className="btn primary" onClick={addCustomEvent} disabled={!form.name || !form.startTime}>
            Add event
          </button>
        </div>

        <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
