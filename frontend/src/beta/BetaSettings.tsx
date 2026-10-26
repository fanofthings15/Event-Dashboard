import { useState, type ReactNode } from "react";
import { useSettings } from "../SettingsContext";
import LiveRankingSettings from "../LiveRankingSettings";
import { COMMON_TIMEZONES, formatEventTime } from "../dateFormat";
import { CORE_SPORT_META, type NormalizedEvent } from "../types";
import { ApiKeySection, CalendarFeedSection, NotificationsSection, RefreshSection, SourcesSection, TeamsSection, TimezoneSection } from "../settingsSections";

// The redesign's Settings page: categories with a one-line summary of how
// each is set up, the chosen one beside them on a desktop, or opened on its
// own (with a way back) on a phone. The controls are the dashboard's own
// sections (settingsSections.tsx), so both stay in step.

type Cat = "sources" | "teams" | "notifications" | "calendar" | "live" | "display" | "custom" | "keys";

export default function BetaSettings({ allEvents, phone, onOpenCustom }: { allEvents: NormalizedEvent[]; phone: boolean; onOpenCustom: () => void }) {
  const { settings } = useSettings();
  const [cat, setCat] = useState<Cat | null>(phone ? null : "sources");

  const coreOn = Object.keys(CORE_SPORT_META).filter((s) => !settings.disabledCoreSources.includes(s)).length;
  const sourcesTotal = Object.keys(CORE_SPORT_META).length + settings.esportsCatalog.length;
  const sourcesOn = coreOn + settings.enabledEsportsGames.length;
  const colours = Object.keys(settings.sportColorOverrides).length;
  const leads = settings.notifyLeadMinutes.length ? ` · ${[...settings.notifyLeadMinutes].sort((a, b) => a - b).map((m) => (m === 0 ? "at start" : `${m} min`)).join(", ")}` : "";
  const ranking = Object.keys(settings.eventRanking ?? {}).length;
  const tzLabel = COMMON_TIMEZONES.find((t) => t.value === settings.timezone)?.label ?? settings.timezone;

  const cats: { id: Cat; label: string; summary: string; body: ReactNode }[] = [
    {
      id: "sources",
      label: "Sources",
      summary: `${sourcesOn} of ${sourcesTotal} on${colours ? ` · ${colours} custom colour${colours === 1 ? "" : "s"}` : ""}`,
      body: <SourcesSection allEvents={allEvents} />,
    },
    { id: "teams", label: "Teams", summary: settings.favoriteTeams.length ? `${settings.favoriteTeams.length} followed` : "None followed yet", body: <TeamsSection /> },
    {
      id: "notifications",
      label: "Notifications",
      summary: !settings.discordWebhookUrl ? "Not set up" : !settings.notifyOnLive ? "Discord · off" : `Discord · ${settings.notifyMode === "followed" ? "followed teams" : "every live event"}${leads}`,
      body: <NotificationsSection />,
    },
    { id: "calendar", label: "Calendar feed", summary: settings.icsFavoritesOnly ? "Favourites only" : "Everything enabled", body: <CalendarFeedSection /> },
    {
      id: "live",
      label: "Live display",
      summary: ranking ? `Ranking · ${ranking} change${ranking === 1 ? "" : "s"}` : "Default ranking",
      body: (
        <>
          <LiveRankingSettings />
          <p className="hint">Quiet hours and the layout are set on the Live display itself, separately on each device.</p>
        </>
      ),
    },
    {
      id: "display",
      label: "Display",
      summary: `${settings.timezone ? tzLabel : "Browser time zone"} · refresh every ${settings.pollIntervalSeconds} s`,
      body: (
        <>
          <TimezoneSection />
          <RefreshSection />
        </>
      ),
    },
    {
      id: "custom",
      label: "Custom events",
      summary: settings.customEvents.length ? `${settings.customEvents.length} event${settings.customEvents.length === 1 ? "" : "s"}` : "None",
      body: (
        <section className="settings-section">
          <h3>Custom events</h3>
          {settings.customEvents.length > 0 && (
            <ul className="b-custom-list">
              {settings.customEvents.map((c) => (
                <li key={c.id}>
                  <span className="b-swatch" style={{ background: c.color, borderColor: c.color }} />
                  <span className="b-ellipsis">{c.name}</span>
                  <span className="b-muted b-small">{formatEventTime(c.startTime, settings.timezone)}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn primary" onClick={onOpenCustom}>
            Add or edit custom events
          </button>
        </section>
      ),
    },
    ...(settings.isAdmin
      ? [
          {
            id: "keys" as Cat,
            label: "API keys",
            summary: `Admin only · PandaScore ${settings.pandaScoreApiKeySet ? "set" : "missing"} · TBA ${settings.tbaApiKeySet ? "set" : "missing"}`,
            body: (
              <>
                <ApiKeySection />
                <p className="hint">The Blue Alliance key is under Sources → FRC.</p>
              </>
            ),
          },
        ]
      : []),
  ];

  const current = cats.find((c) => c.id === cat);

  const list = (
    <div className="b-cats" role="tablist" aria-label="Settings" aria-orientation="vertical">
      {cats.map((c) => (
        <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} className={`b-cat${cat === c.id ? " active" : ""}`} onClick={() => setCat(c.id)}>
          <span className="b-cat-label">{c.label}</span>
          <span className="b-muted b-small b-ellipsis">{c.summary}</span>
          {phone && <span aria-hidden="true" className="b-cat-chev">›</span>}
        </button>
      ))}
    </div>
  );

  if (phone) {
    return (
      <section className="b-section">
        {current ? (
          <>
            <div className="b-settings-back">
              <button type="button" className="b-iconbtn" aria-label="Back to settings" onClick={() => setCat(null)}>
                ‹
              </button>
              <h1 className="b-h1">{current.label}</h1>
            </div>
            <div className="b-settings-body" role="tabpanel">
              {current.body}
            </div>
          </>
        ) : (
          <>
            <h1 className="b-h1">Settings</h1>
            {list}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="b-section">
      <h1 className="b-h1">Settings</h1>
      <div className="b-settings">
        {list}
        <div className="b-settings-body b-panel" role="tabpanel" aria-label={current?.label}>
          {current?.body}
        </div>
      </div>
    </section>
  );
}
