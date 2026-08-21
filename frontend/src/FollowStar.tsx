import type { NormalizedEvent } from "./types";
import { useSettings } from "./SettingsContext";

interface Props {
  event: NormalizedEvent;
}

// Shared between the card grid and the detail view so "follow" always looks
// and behaves the same place either way — filled star = following, click
// toggles. Custom events are always manuallyFollowed server-side (there's
// nothing to toggle), so no star for those.
export default function FollowStar({ event }: Props) {
  const { settings, save } = useSettings();
  if (event.sport === "custom") return null;

  const eventKey = `${event.sport}-${event.id}`;
  const isFollowed = event.manuallyFollowed || settings.followedEventIds.includes(eventKey);

  async function toggle(evt: React.MouseEvent) {
    evt.stopPropagation();
    if (isFollowed) {
      await save({ followedEventIds: settings.followedEventIds.filter((k) => k !== eventKey) });
      return;
    }
    // Following implies wanting a heads-up when it goes live — request
    // permission if we don't have it yet, and make sure the global
    // notify-on-live setting is actually on.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    await save({ followedEventIds: [...settings.followedEventIds, eventKey], notifyOnLive: true });
  }

  return (
    <button
      type="button"
      className={`follow-star${isFollowed ? " is-followed" : ""}`}
      aria-label={isFollowed ? "Unfollow event" : "Follow event — get notified when it goes live"}
      aria-pressed={isFollowed}
      onClick={toggle}
    >
      {isFollowed ? "★" : "☆"}
    </button>
  );
}
