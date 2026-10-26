import LiveRankingSettings from "./LiveRankingSettings";
import {
  ApiKeySection,
  CalendarFeedSection,
  LayoutSection,
  NotificationsSection,
  RefreshSection,
  SourcesSection,
  TeamsSection,
  ThemeSection,
  TimezoneSection,
} from "./settingsSections";
import type { NormalizedEvent } from "./types";

interface Props {
  onClose: () => void;
  allEvents: NormalizedEvent[];
}

// The dashboard's settings drawer: every section in one scrolling column.
// The sections themselves live in settingsSections.tsx, shared with the
// redesign's Settings page.
export default function SettingsDrawer({ onClose, allEvents }: Props) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <ApiKeySection />
        <SourcesSection allEvents={allEvents} />
        <TeamsSection />
        <NotificationsSection />
        <RefreshSection />
        <ThemeSection />
        <LayoutSection />
        <LiveRankingSettings />
        <TimezoneSection />
        <CalendarFeedSection />
        <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
