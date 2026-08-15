import { useEffect, useState } from "react";
import { useSettings } from "./SettingsContext";
import { sportMeta } from "./sportMeta";
import type { NormalizedEvent, StandingsGroup } from "./types";
import { STANDINGS_SPORTS, type StandingsSport } from "./useStandings";

interface Props {
  standingsBySport: Partial<Record<StandingsSport, StandingsGroup[]>>;
  loading: boolean;
  loaded: boolean;
  onRefresh: () => void;
}

function StandingsTable({ group }: { group: StandingsGroup }) {
  // Column set is the union of extra-fact labels seen across this group's
  // rows, in the order the backend emitted them — so a sport that doesn't
  // have e.g. "T" (ties) just doesn't get that column.
  const columns: string[] = [];
  for (const row of group.rows) {
    for (const fact of row.extra ?? []) {
      if (!columns.includes(fact.label)) columns.push(fact.label);
    }
  }

  return (
    <div className="standings-table-wrap">
      <h3 className="standings-group-title">{group.name}</h3>
      <table className="standings-table">
        <thead>
          <tr>
            <th className="standings-rank-col">#</th>
            <th>Team</th>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row, i) => {
            const factByLabel = new Map((row.extra ?? []).map((f) => [f.label, f.value]));
            return (
              <tr key={`${row.team}-${i}`}>
                <td className="standings-rank-col">{row.rank ?? i + 1}</td>
                <td className="standings-team-cell">
                  {row.imageUrl && <img src={row.imageUrl} alt="" className="standings-team-logo" />}
                  <span>{row.team}</span>
                </td>
                {columns.map((c) => (
                  <td key={c}>{factByLabel.get(c) ?? "—"}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StandingsView({ standingsBySport, loading, loaded, onRefresh }: Props) {
  const { settings } = useSettings();
  const available = STANDINGS_SPORTS.filter((s) => !settings.disabledCoreSources.includes(s));
  const [activeSport, setActiveSport] = useState<StandingsSport | null>(available[0] ?? null);

  useEffect(() => {
    if (!loaded && !loading) onRefresh();
    // Only fires once, on first mount of this view — refetch is stable
    // across renders (useCallback in useStandings).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeSport && !available.includes(activeSport)) {
      setActiveSport(available[0] ?? null);
    }
  }, [available.join(","), activeSport]);

  if (available.length === 0) {
    return <div className="empty">No standings sources enabled — turn on NFL, NBA, NHL, or F1 in Settings.</div>;
  }

  const groups = activeSport ? standingsBySport[activeSport] : undefined;

  return (
    <section>
      <div className="filters" style={{ justifyContent: "space-between" }}>
        <div className="filters" style={{ marginBottom: 0 }}>
          {available.map((sport) => {
            const meta = sportMeta({ sport } as NormalizedEvent, settings.esportsCatalog, settings.sportColorOverrides);
            const active = activeSport === sport;
            return (
              <button
                key={sport}
                type="button"
                className={`chip ${active ? "active" : ""}`}
                style={active ? { borderColor: meta.color, background: `${meta.color}26`, color: "#fff" } : undefined}
                onClick={() => setActiveSport(sport)}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
        <button className="btn small" onClick={onRefresh} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {loading && !loaded ? (
        <div className="empty">Loading standings…</div>
      ) : !groups || groups.length === 0 ? (
        <div className="empty">No standings data available right now.</div>
      ) : (
        groups.map((group) => <StandingsTable key={group.name} group={group} />)
      )}
    </section>
  );
}
