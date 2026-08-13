# Event Dashboard

Personal one-stop dashboard for NFL, NBA, NHL, F1, FRC, and esports (CS2,
League of Legends, Rocket League, and more) — live status, upcoming
schedule, a calendar view, and click-through event details, all in one page.

Bun runtime, React + TypeScript (Vite) frontend, Express + TypeScript
backend (run directly by Bun, no compile step) acting as an API proxy,
single-port production serving.

## Data sources (all free)

| Sport | Source | Trade-off |
|---|---|---|
| NFL / NBA / NHL | ESPN scoreboard endpoint (unofficial) | No API key, but undocumented — could change without notice |
| F1 | Jolpica (free Ergast successor) | Full schedule/results, no live timing — "live" is approximated from scheduled start time |
| FRC | The Blue Alliance API | Free key required; shows full events only (not individual matches) |
| Esports (CS2, LoL, Rocket League, Valorant, Overwatch 2, Dota 2, R6 Siege) | PandaScore free tier | ~1000 requests/month cap; some lower-tier tournaments may be gated behind paid plans |

## Setup

```bash
bun install
cd backend && bun install && cd ..
cd frontend && bun install && cd ..
git config core.hooksPath .githooks
```

Get a free PandaScore API key at https://pandascore.co (needed for esports
data only — NFL and F1 need no key). Paste it into the app's Settings drawer
once it's running, not into a config file.

## Running it (development)

```bash
bun run dev
```

Backend on :3020, frontend dev server on :5290 by default (override with
`FRONTEND_PORT=xxxx`) — proxies `/api` to :3020.
Open **http://localhost:5290**.

## Running it (production-style, one process)

```bash
bun run build
cd backend && bun run start
```

Open **http://localhost:3020**.

## Main page

- **Click any event** — card, calendar day, or hourly breakdown — for a
  detail view: teams/players with logos and records where available, a
  "Watch live" button when a stream link exists, best-of series scores
  (e.g. "2-1 (Bo3)"), venue, and other facts. When a source (mainly
  PandaScore) gives no richer data or link, it falls back to a Liquipedia
  search for that match. A "Hide this league" button there adds it to your
  exclusions in one click — no need to find and type it elsewhere.
- **Add to Google Calendar** — on the detail view, opens Google Calendar
  pre-filled with the event name, date/time, teams, and any stream/info
  link. Uses Google's public "create event" URL, which needs **no API key
  or sign-in on this end** — you just confirm and save it on Google's side.
  (If you actually want events inserted automatically without that manual
  step, that needs real OAuth setup, which is a bigger follow-up — say the
  word if you want that instead.)
- **+ Add Event** — opens the custom events panel directly (name, league,
  color, start time, duration as hours + minutes, optional link). Moved
  here from Settings since it's something you'll reach for often, not a
  one-time config.
- **Select all / Deselect all** — next to the sport filter chips, for
  quickly narrowing to just what you want to look at right now.
- **Calendar** — toggles the Live/Upcoming list for a month calendar (equal-
  width days). Multiple same-day events for one sport collapse to shorthand
  (e.g. "5x League of Legends"); click any day for an hourly breakdown.

## Settings menu

Click **Settings** for:
- **PandaScore API key** — needed for esports data.
- **Blue Alliance API key + team to follow** — needed for FRC data. Free key
  at thebluealliance.com/account.
- **Data sources** — toggle chips for NFL, NBA, NHL, F1, FRC, and every
  esports title in the catalog. Off means skipped entirely — no request
  made, nothing shown, and it saves the instant you click (no Save button,
  no reload needed — the whole app shares one live settings state). Add more
  esports titles by editing `backend/src/esportsCatalog.ts` (double-check
  the PandaScore slug — it's not always the obvious name, e.g. Rocket League
  is `rl`); add more ESPN-covered sports (e.g. MLB) via
  `backend/src/espnScoreboard.ts`'s router factory.
- **Leagues** — per-sport checkboxes built from whatever leagues are
  currently showing up in your data (so a one-off tournament doesn't clutter
  this list forever once it's gone), plus **Export/Import** for moving to a
  new machine. Import shows an in-app confirmation before overwriting
  anything — never a browser popup. Export deliberately leaves out your API
  keys for safety, so those need re-entering once after an import.

Custom events and all settings are saved to `~/.event-dashboard/settings.json`,
**outside the git repo**, so they survive every future code sync/deploy
untouched. All of this is server-side state, not browser storage — it's
what "stored locally" means here: it lives in a file on your machine, never
sent anywhere but each service's own API and back to your own browser.

## Testing status

Type-checked and built successfully (frontend and backend). The
settings/custom-events/import-export system was exercised directly
end-to-end against the running backend (create, filter, disable, export,
import, read back) and confirmed working — this part doesn't depend on any
external API, so it's genuinely verified, not just "should work."

The sandbox this was built in can't reach espn.com, jolpi.ca,
thebluealliance.com, or pandascore.co, so the NFL, NBA, NHL, F1, FRC, and
esports routes are correct against each API's documented shape but **not
verified against a live response**. One real bug was already caught this
way and fixed: PandaScore's Rocket League slug is `rl`, not the
`rocket-league` guess originally used — worth treating every external route
as "should work" rather than "confirmed working" until you've run it for
real, especially FRC, which is new this round.

**If you already have a settings file from before the Rocket League fix:**
your saved `enabledEsportsGames` list still has the old `rocket-league`
string in it, which won't match anything anymore (silently — no error).
Open Settings and re-toggle the Rocket League chip once.

## Notes

- Settings are stored as plaintext JSON — it's a free API key plus your own
  data, not a real secret. Say the word if you'd rather the key be encrypted
  at rest.
- Backend polls/caches each upstream API for 60s–1hr depending on how often
  that data actually changes, to stay well under free-tier rate limits.
- Countdown timers tick client-side every 15s independent of data polls
  (which happen every 60s or on manual Resync), so they don't freeze between
  fetches.
- Warnings (e.g. one esports title failing to sync) can be dismissed with the
  ×. Dismissal is by exact message text and lasts for the current page
  session — if the identical warning recurs on a later poll it stays hidden;
  a warning with different wording (e.g. a different HTTP status) will still
  show. Reload the page to clear all dismissals.
- An event is shown as **Live** the moment the local clock passes its start
  time, even if the backend's last poll (up to 60s old) still says
  "upcoming" — it doesn't wait for the next fetch to catch up.
