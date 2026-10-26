import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../SettingsContext";
import type { CustomEvent } from "../settingsTypes";
import { CORE_SPORT_META } from "../types";
import { useSwipeToClose } from "../useSwipeToClose";

// Adding or editing a custom event, in as few taps as possible: a name, a
// day (today unless a day was picked), a start time (the next full hour), a
// length from a few common ones, and a colour. Category and link are tucked
// under "More options". Opens as a bottom sheet on a phone, a dialog on a
// desktop.

const LENGTHS: [number, string][] = [
  [30, "30 min"],
  [60, "1 h"],
  [120, "2 h"],
  [180, "3 h"],
  [1440, "All day"],
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function localTime(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function EventSheet({ editing, date, onClose, onSaved }: { editing?: CustomEvent; date?: string; onClose: () => void; onSaved: () => void }) {
  const { settings, save } = useSettings();

  const initial = useMemo(() => {
    if (editing) {
      const start = new Date(editing.startTime);
      return { name: editing.name, date: localDate(start), time: localTime(start), length: editing.durationMinutes, color: editing.color, league: editing.league === "Custom" ? "" : editing.league, url: editing.url ?? "" };
    }
    const next = new Date();
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return { name: "", date: date ?? localDate(next), time: localTime(next), length: 120, color: "#4f8dfd", league: "", url: "" };
  }, [editing, date]);

  const [form, setForm] = useState(initial);
  const [more, setMore] = useState(Boolean(initial.league || initial.url));
  const [customLength, setCustomLength] = useState(!LENGTHS.some(([m]) => m === initial.length));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const swipe = useSwipeToClose(onClose);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // the user's own source colours first, then a few more
  const swatches = useMemo(() => {
    const own = [
      ...Object.keys(CORE_SPORT_META).map((s) => settings.sportColorOverrides[s] || CORE_SPORT_META[s].color),
      ...settings.esportsCatalog.filter((g) => settings.enabledEsportsGames.includes(g.slug)).map((g) => settings.sportColorOverrides[g.sport] || g.color),
    ];
    return [...new Set([...own, "#4f8dfd", "#f472b6", "#94a3b8"])].slice(0, 14);
  }, [settings]);
  const categories = useMemo(() => [...new Set(settings.customEvents.map((e) => e.league).filter((l) => l && l !== "Custom"))], [settings.customEvents]);

  const startIso = form.date && form.time ? new Date(`${form.date}T${form.time}`).toISOString() : "";
  const valid = form.name.trim() !== "" && startIso !== "" && form.length > 0;

  async function submit() {
    if (!valid) return;
    const event: CustomEvent = {
      id: editing?.id ?? uid(),
      name: form.name.trim(),
      league: form.league.trim() || "Custom",
      color: form.color,
      startTime: startIso,
      durationMinutes: form.length,
      url: form.url.trim() || undefined,
    };
    const rest = settings.customEvents.filter((e) => e.id !== event.id);
    await save({ customEvents: [...rest, event] });
    onSaved(); // the game lists only re-poll every minute otherwise
    onClose();
  }

  async function remove() {
    if (!editing) return;
    await save({ customEvents: settings.customEvents.filter((e) => e.id !== editing.id) });
    onSaved();
    onClose();
  }

  return (
    <div className="b-sheet-backdrop" onClick={onClose}>
      <form
        className="b-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="b-sheet-title"
        onClick={(e) => e.stopPropagation()}
        style={swipe.style}
        {...swipe.handlers}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="b-sheet-head">
          <h2 id="b-sheet-title" className="b-h2">
            {editing ? "Edit event" : "New event"}
          </h2>
          <button type="button" className="b-iconbtn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <label className="b-field">
          <span>Name</span>
          <input ref={nameRef} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Watch party at Sam's" />
        </label>

        <div className="b-field-row">
          <label className="b-field">
            <span>Day</span>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <label className="b-field">
            <span>Starts</span>
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </label>
        </div>

        <div className="b-field">
          <span>Length</span>
          <div className="b-choice-row" role="group" aria-label="Length">
            {LENGTHS.map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={!customLength && form.length === m}
                className={!customLength && form.length === m ? "on" : ""}
                onClick={() => {
                  setCustomLength(false);
                  setForm({ ...form, length: m });
                }}
              >
                {label}
              </button>
            ))}
            <button type="button" aria-pressed={customLength} className={customLength ? "on" : ""} onClick={() => setCustomLength(true)}>
              Other
            </button>
          </div>
          {customLength && (
            <label className="b-inline-field">
              <input type="number" min={5} step={5} value={form.length} onChange={(e) => setForm({ ...form, length: Math.max(0, Number(e.target.value)) })} />
              minutes
            </label>
          )}
        </div>

        <div className="b-field">
          <span>Colour</span>
          <div className="b-swatch-row" role="group" aria-label="Colour">
            {swatches.map((c) => (
              <button key={c} type="button" aria-label={c} aria-pressed={form.color === c} className={form.color === c ? "on" : ""} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />
            ))}
          </div>
        </div>

        {more ? (
          <>
            <label className="b-field">
              <span>Category (optional)</span>
              <input list="b-categories" value={form.league} onChange={(e) => setForm({ ...form, league: e.target.value })} placeholder="Shown with the event, e.g. Watch parties" />
              <datalist id="b-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="b-field">
              <span>Link (optional)</span>
              <input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="Stream, tickets, anything" />
            </label>
          </>
        ) : (
          <button type="button" className="b-link b-link-left" onClick={() => setMore(true)}>
            More options (category, link)
          </button>
        )}

        <div className="b-sheet-actions">
          {editing &&
            (confirmDelete ? (
              <button type="button" className="b-danger" onClick={remove}>
                Delete for good
              </button>
            ) : (
              <button type="button" className="b-ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            ))}
          <button type="submit" className="b-primary" disabled={!valid}>
            {editing ? "Save" : "Add event"}
          </button>
        </div>
      </form>
    </div>
  );
}
