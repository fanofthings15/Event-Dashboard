import type { NormalizedEvent } from "./types";
import { useSettings } from "./SettingsContext";
import { hasWatchableStream, withEventStreamSlot, withoutEventStreamSlot } from "./eventStreamSlots";

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
      const { slots, mainId } = withoutEventStreamSlot(settings.streamSlots, settings.streamMainSlotId, event);
      await save({
        followedEventIds: settings.followedEventIds.filter((k) => k !== eventKey),
        streamSlots: slots,
        streamMainSlotId: mainId,
      });
      return;
    }
    // Following implies wanting a heads-up when it goes live — request
    // permission if we don't have it yet, and make sure the global
    // notify-on-live setting is actually on.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    const followedEventIds = [...settings.followedEventIds, eventKey];
    // Anything with a real broadcast link (currently: esports matches, via
    // PandaScore's official stream) also lands in the Streams tab — not
    // ESPN/F1/FRC's own detail-page links, which aren't actual streams.
    if (hasWatchableStream(event)) {
      await save({ followedEventIds, notifyOnLive: true, streamSlots: withEventStreamSlot(settings.streamSlots, event, event.streamUrl!) });
    } else {
      await save({ followedEventIds, notifyOnLive: true });
    }
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
