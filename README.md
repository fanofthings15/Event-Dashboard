# Event Dashboard

Personal one-stop dashboard for NFL, NBA, NHL, F1, and esports (CS2, League
of Legends, Rocket League, and more) — live status, upcoming schedule, and a
calendar view, all in one page.

Bun runtime, React + TypeScript (Vite) frontend, Express + TypeScript
backend (run directly by Bun, no compile step) acting as an API proxy,
single-port production serving.

## Data sources (all free)

| Sport | Source | Trade-off |
|---|---|---|
| NFL / NBA / NHL | ESPN scoreboard endpoint (unofficial) | No API key, but undocumented — could change without notice |
| F1 | Jolpica (free Ergast successor) | Full schedule/results, no live timing — "live" is approximated from scheduled start time |
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

- **+ Add Event** — opens the custom events panel directly (name, league,
  color, start time, how long it counts as "live"). Moved here from Settings
  since it's something you'll reach for often, not a one-time config.
- **Select all / Deselect all** — next to the sport filter chips, for
  quickly narrowing to just what you want to look at right now.
- **Calendar** — toggles the Live/Upcoming list for a month calendar.
  Multiple same-day events for one sport collapse to shorthand (e.g. "5x
  League of Legends") to keep every day the same width; click any day for an
  hourly breakdown with full event names and times.

## Settings menu

Click **Settings** for:
- **PandaScore API key** — needed for esports data only.
- **Data sources** — toggle chips for NFL, NBA, NHL, F1, and every esports
  title in the catalog (CS2, LoL, Rocket League, Valorant, Overwatch 2,
  Dota 2, R6 Siege). Off means skipped entirely — no request made, nothing
  shown. Add more titles by editing `backend/src/esportsCatalog.ts` (double
  check the PandaScore slug — it's not always the obvious name, e.g. Rocket
  League is `rl`); add more ESPN-covered sports (e.g. MLB) by adding a route
  via `backend/src/espnScoreboard.ts`'s router factory.
- **Excluded leagues** — one per line, hides any league whose name contains
  that text (e.g. "LCK Challengers League" without touching the main LCK).

Custom events are saved to `~/.event-dashboard/settings.json`, **outside
the git repo**, so they survive every future code sync/deploy untouched.
All of this is server-side state, not browser storage — it's what "stored
locally" means here: it lives in a file on your machine, never sent anywhere
but PandaScore's API and back to your own browser.

## Testing status

Type-checked and built successfully (frontend and backend) in the sandbox
this was built in. The settings/custom-events system was exercised directly
end-to-end (create, filter, disable, read back) and confirmed working.

That sandbox can't reach espn.com, jolpi.ca, or pandascore.co, so the NFL,
NBA, NHL, F1, and esports routes are correct against each API's documented
shape but **not verified against a live response**. One real bug was already
caught this way and fixed: PandaScore's Rocket League slug is `rl`, not the
`rocket-league` guess originally used, which caused a live 404 — worth
treating every external route as "should work" rather than "confirmed
working" until you've run it for real.

**If you already have a settings file from before this fix:** your saved
`enabledEsportsGames` list still has the old `rocket-league` string in it,
which won't match anything anymore (silently — no error). Open Settings and
re-toggle the Rocket League chip once to save it under the corrected `rl`.

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
