import { useEffect, useState } from "react";
import { useSettings } from "./SettingsContext";
import { DEFAULT_RANKING, RANKING_ESPORTS, RANKING_ROWS } from "./live/multiGame";

// The /live display's points table (how big each kind of event is), per
// user: only values changed from the default are saved.
export default function LiveRankingSettings() {
  const { settings, save, loaded } = useSettings();
  const ranking = settings.eventRanking ?? {};
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => setDrafts({}), [settings.eventRanking]);

  const valueOf = (key: string) => drafts[key] ?? String(ranking[key] ?? DEFAULT_RANKING[key]);

  function commit(key: string) {
    const raw = drafts[key];
    if (raw === undefined) return;
    const n = Number(raw);
    const next = { ...ranking };
    if (raw.trim() === "" || !Number.isFinite(n) || Math.round(n) === DEFAULT_RANKING[key]) delete next[key];
    else next[key] = Math.max(-100, Math.min(200, Math.round(n)));
    if (JSON.stringify(next) === JSON.stringify(ranking)) setDrafts(({ [key]: _, ...rest }) => rest);
    else save({ eventRanking: next });
  }

  const input = (key: string, label: string) => (
    <input
      type="number"
      inputMode="numeric"
      className={`text-input ranking-input${ranking[key] !== undefined ? " changed" : ""}`}
      aria-label={label}
      title={`Default ${DEFAULT_RANKING[key]}`}
      disabled={!loaded}
      value={valueOf(key)}
      onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
      onBlur={() => commit(key)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );

  const changed = Object.keys(ranking).length > 0;

  return (
    <section className="settings-section">
      <h3>Live display ranking</h3>
      <span className="hint">
        Higher gets the big spot on the live display. On top of this, a big moment (red zone, late close game) adds up
        to 35 and a followed team 30–35.
      </span>
      <div className="ranking-list">
        {RANKING_ROWS.map(({ key, label }) => (
          <label key={key} className="ranking-row">
            <span>{label}</span>
            {input(key, label)}
          </label>
        ))}
      </div>
      <table className="ranking-esports">
        <thead>
          <tr>
            <th>Esports</th>
            {RANKING_ESPORTS.stages.map((st) => (
              <th key={st}>{st === "semifinal" ? "Semi" : st[0].toUpperCase() + st.slice(1)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RANKING_ESPORTS.tiers.map((t) => (
            <tr key={t}>
              <th>Tier {t.toUpperCase()}</th>
              {RANKING_ESPORTS.stages.map((st) => (
                <td key={st}>{input(`esports-${t}-${st}`, `Esports tier ${t.toUpperCase()} ${st}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {changed && (
        <button type="button" className="btn-x-link" onClick={() => save({ eventRanking: {} })}>
          Reset to defaults
        </button>
      )}
    </section>
  );
}
