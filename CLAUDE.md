# Event Dashboard — project context

Personal single-user web dashboard aggregating live scores and schedules
for NFL, NBA, NHL, F1, FRC, and esports into one page. Not a multi-tenant
product — single user, single settings file, no auth.

## Stack

- **Runtime:** Bun (not Node) — backend TypeScript runs directly via Bun,
  no compile step in dev.
- **Frontend:** React + TypeScript, Vite. Dev server on :5290 (override
  with `FRONTEND_PORT`), proxies `/api` to the backend.
- **Backend:** Express + TypeScript, acts as an API proxy/aggregator over
  several free external APIs. Runs on :3020.
- **Production:** single process — backend serves the built frontend
  directly on one port. See `bun run build:exe` for the Windows single-exe
  build (fflate-zips the built UI, embeds it via a Bun `with { type: "file" }`
  import, extracts to a temp dir at runtime).

## Repo layout

```
backend/src/
  index.ts              — Express app, exe/dev UI-serving logic
  settings.ts            — Settings type + defaults + readSettings()/writeSettings()
  routes/                — one file per data source (nfl.ts, nba.ts, nhl.ts share
                            espnScoreboard.ts's factory; f1.ts, frc.ts, esports.ts,
                            customEvents.ts, settings.ts, ics.ts are standalone)
  types.ts                — NormalizedEvent shape everything gets mapped into
  esportsCatalog.ts       — PandaScore slug/sport/label/color per esports title
  favoriteTeams.ts         — shared favorite-team matching logic (also used by ics.ts)
  frcMatchProgress.ts      — TBA match-data → "Qual Match 23 of 40" / "Semifinals — Match 2"
frontend/src/
  App.tsx                 — main page, all four views (List/Calendar/Today/Finished)
  useEvents.ts             — polling, merging, filtering, notification-firing logic
  SettingsContext.tsx      — shared live settings state, the whole app reads/writes this
  SourceSettings.tsx       — per-data-source settings groups (on/off, color, league filters)
  SettingsDrawer.tsx        — everything NOT source-specific (global keys, favorites,
                              notifications, theme, layout, timezone, calendar feed)
  EventDetailModal.tsx      — click-through event detail, stream picker, follow/snooze
  CalendarView.tsx / DayDetailModal.tsx — month grid + hourly breakdown
  dateFormat.ts             — shared timezone-aware date/time formatters
```

Every route maps its source's raw API response into `NormalizedEvent`
(`backend/src/types.ts`) — that's the one shape the whole frontend consumes,
regardless of source.

## Data sources

| Sport | Source | Key needed | Notes |
|---|---|---|---|
| NFL/NBA/NHL | ESPN scoreboard endpoint (unofficial) | No | Undocumented, could change without notice |
| F1 | Jolpica (Ergast successor) | No | Schedule/results only, no live timing |
| FRC | The Blue Alliance API | Yes (free) | Full events only, not individual matches |
| Esports | PandaScore | Yes (free tier) | ~1000 req/month cap |

**PandaScore esports slugs are not always the obvious name** — e.g. Rocket
League is `rl`, not `rocket-league`. This was a real bug once; verify any
new title's slug against a real API response before assuming it.

**FRC districts:** region names (FIM, FIT, etc.) come from two layered
sources — TBA's own `/district/{key}/events/keys` data first, then a
static state→district fallback table in `frc.ts` for events TBA doesn't
officially tag under a district (e.g. off-season events). The static table
was derived from real 2026 season data, not guessed.

## Settings model

Everything lives in one `Settings` object (`backend/src/settings.ts`),
persisted to `~/.event-dashboard/settings.json` — **outside the repo**, so
it survives every deploy. `SettingsContext.tsx` on the frontend mirrors
this via GET/POST `/api/settings` and is the single source of truth the
whole app reads from.

**When adding a new settings field:** always give it a sensible default in
`DEFAULTS`, and if the *type* of an existing field ever changes (e.g.
number → array), add a migration step in `readSettings()`. A real
production bug happened once from skipping this — an existing
`settings.json` on disk still had the old shape, and the frontend crashed
calling array methods on what was actually still a number.

## Conventions

- **Git:** default branch is `main`, never `master`. No Claude/AI
  attribution anywhere in commit messages or history (no
  `Co-Authored-By`, nothing referencing Claude). The user runs
  `git status`/`add`/`commit`/`push` themselves and wants to read the
  actual output before committing — don't commit and push autonomously
  without being asked to, and don't claim a commit succeeded without
  showing the real command output.
- **Releases:** don't tag a new version without being explicitly asked to,
  and when tagging, `git status`/`git log` first to confirm `main` is
  actually clean and has everything intended — a tag pointing at a stale
  commit has caused real CI confusion before (built an old exe with a
  stale filename, missing fixes).
- **Mobile:** audit responsive design (wrapping headers, tap target
  sizing, column collapse) from the start on anything that might see
  phone/tablet use, not as a later pass.
- **Testing:** actually run things — `bun install` + `bun run dev`, hit
  the real endpoints, watch real console output — rather than only
  type-checking. This project was largely built from a sandboxed chat
  environment with no network access to espn.com, thebluealliance.com,
  pandascore.co, or jolpi.ca, and no ability to run Bun at all — so
  several routes are correct against each API's *documented* shape but
  were never confirmed against a live response. Treat anything below as
  "should work," not "confirmed working," until actually run.

## Known unverified areas (worth checking first)

- `backend/src/espnScoreboard.ts`'s `liveDetail` field (current game
  clock/period, e.g. "Q3 8:42") — built from ESPN's conventional
  `status.type.shortDetail`/`detail` fields based on general knowledge of
  their site API, never confirmed against a real in-progress game.
- The stream-source popup in `EventDetailModal.tsx` — the ranking/dedup
  logic was verified with synthetic PandaScore-shaped data, not a real
  match response.
- Anything in `frc.ts`'s district-matching logic beyond what was directly
  confirmed via real `curl` output the user provided mid-conversation —
  that data is now a season old by the time this reads it.

## Notable past bugs (avoid repeating)

- **Bun's compiled-executable internal path marker differs by platform:**
  `$bunfs` on Linux/macOS, `~BUN` on Windows (e.g. `B:/~BUN/root/...`).
  `isCompiledExe()` in `index.ts` checks both — don't narrow this back to
  one pattern.
- **A settings field's type changing without a migration step will crash
  the frontend** for anyone with an existing `settings.json` — see the
  Settings model section above.
- **An unmemoized callback passed into `useEvents`'s dependency array will
  cause a spam-resync loop** — every render recreates the fetch effect,
  causing back-to-back fetches with no delay. Any function passed as
  `onNotify` (or similar) must be wrapped in `useCallback` with stable
  dependencies. This actually happened once and required killing the dev
  server.
- Frontend's `tsconfig.json` uses project references (`"files": []`) — a
  bare `npx tsc --noEmit` in `frontend/` silently checks nothing. Use
  `npm run build` or `npx tsc -b --noEmit` for a real type-check.
