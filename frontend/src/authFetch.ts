const RELOAD_GUARD_KEY = "event-dashboard-auth-reload-at";
const RELOAD_GUARD_COOLDOWN_MS = 30_000;

// Authentik's forward-auth session (separate from cookie/SSO login) expires
// after the provider's access_token_validity (currently 1h) — the next
// request to a protected router gets redirected to auth.${DOMAIN} instead
// of reaching the app. A top-level navigation follows that redirect fine
// (silent re-auth via the still-live SSO session); a background fetch()
// can't, because the redirect target is a different origin with no CORS
// headers, so the browser refuses to hand the response back — every poll
// then "fails" identically to a real network outage until the tab is
// manually refreshed. `redirect: "manual"` lets us tell the two apart: a
// redirected response resolves as an opaque "opaqueredirect" instead of
// throwing, so we can force the one thing that actually fixes it (a real
// navigation) instead of leaving the UI stuck looking offline.
function reauthRedirectDetected() {
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
  if (Date.now() - last < RELOAD_GUARD_COOLDOWN_MS) return; // avoid a reload loop if something else is wrong
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  window.location.reload();
}

// Wraps fetch() so an expired forward-auth session triggers a real reload
// instead of surfacing as an indistinguishable network failure. Returns
// null when a reload was triggered — callers should treat that as "no data
// yet," same as any other in-flight state, since the page is about to reload.
export async function reauthAwareFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const r = await fetch(url, { ...init, redirect: "manual" });
  if (r.type === "opaqueredirect") {
    reauthRedirectDetected();
    return null;
  }
  return r;
}
