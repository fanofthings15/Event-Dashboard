// YouTube's embedded player starts a live stream at a low quality (480p is
// typical) and ramps up on its own — sometimes slowly, sometimes not at
// all. The `vq=` URL parameter that used to force this was deprecated by
// YouTube years ago and no longer does anything reliable; the only real
// control left is the IFrame Player JS API's setPlaybackQuality, called on
// an iframe that already has `enablejsapi=1` in its src (toEmbedUrl sets
// this on every YouTube embed).

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLIFrameElement, opts: Record<string, unknown>) => any };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiReady: Promise<NonNullable<Window["YT"]>> | null = null;

function loadApi(): Promise<NonNullable<Window["YT"]>> {
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return apiReady;
}

// Requests the highest quality level YouTube says this particular stream
// actually offers (rather than a hardcoded "hd1080"/"highres", which just
// gets silently clamped anyway on streams that don't go that high — asking
// for what's really available skips that guesswork).
function assertMaxQuality(player: any) {
  try {
    const levels: string[] = player.getAvailableQualityLevels?.() ?? [];
    player.setPlaybackQuality(levels[0] ?? "hd1080");
  } catch {
    // Player not in a state that accepts this yet — the reassert loop below
    // covers it.
  }
}

// Attaches to an already-rendered YouTube iframe and pushes it to max
// quality, reasserting a few times over the first half-minute — the
// moment this actually needs to win is right as a live stream starts
// buffering, a beat after `onReady` fires, and YouTube's own adaptive
// logic tends to quietly walk it back down again shortly after that.
// Returns a cleanup function; call it when the iframe is replaced/removed.
export function forceMaxQuality(iframeEl: HTMLIFrameElement): () => void {
  let cancelled = false;
  let reassertTimer: number | undefined;

  loadApi().then((YT) => {
    if (cancelled) return;
    new YT.Player(iframeEl, {
      events: {
        onReady: (e: any) => {
          if (cancelled) return;
          assertMaxQuality(e.target);
          let attempts = 0;
          reassertTimer = window.setInterval(() => {
            attempts++;
            assertMaxQuality(e.target);
            if (attempts >= 5) window.clearInterval(reassertTimer);
          }, 5000);
        },
        onStateChange: (e: any) => {
          if (!cancelled && e.data === 1 /* YT.PlayerState.PLAYING */) assertMaxQuality(e.target);
        },
      },
    });
  });

  return () => {
    cancelled = true;
    if (reassertTimer) window.clearInterval(reassertTimer);
  };
}
