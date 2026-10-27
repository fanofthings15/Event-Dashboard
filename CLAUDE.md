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
  liveEspn.ts              — ESPN game summary → per-sport live state for /live
  f1Live.ts                — F1 live-timing SignalR Core client + MultiViewer circuit map
  routes/live.ts           — /api/live/espn/:sport/:id, /api/live/f1, /api/live/frc/:eventKey
frontend/src/
  useEvents.ts             — polling, merging, filtering, notification-firing logic
  SettingsContext.tsx      — shared live settings state, the whole app reads/writes this
  SourceSettings.tsx       — per-data-source settings groups (on/off, color, league filters)
  settingsSections.tsx      — everything NOT source-specific (keys, teams,
                              notifications, timezone, refresh, calendar feed), one
                              component per block, laid out by dashboard/SettingsPage.tsx
  EventDetailModal.tsx      — click-through event detail, stream picker, follow/snooze
  CalendarView.tsx / DayDetailModal.tsx — month grid + hourly breakdown
  dateFormat.ts             — shared timezone-aware date/time formatters
  dashboard/                — the main UI at / (App.tsx: Rail II sidebar on desktop,
                              Home layout + bottom tab bar on phones; dark only, real
                              team logos; parts.tsx tiles/rows, SettingsPage.tsx,
                              EventSheet.tsx new/edit event). Built at /beta and made
                              the main UI 2026-10-26; the old tabbed App.tsx, drawer,
                              theme/compact settings and light palette were deleted.
                              /beta still loads it (any path but /live does).
  live/                     — /live full-screen display (main.tsx routes by pathname):
                              LiveScreen.tsx, selectLiveEvent.ts (the placeholder
                              "which game to show" policy — change it there),
                              views/ (one per sport), surfaces/ (regulation rink,
                              court, field, ballpark from the real fence, BallFlight),
                              Stream.tsx (esports and pasted FRC webcasts)
```

/live layout rule: all text is HTML in `live/Layout.tsx`'s shell (header,
side panel, footer — grid/flex with ellipsis, stacked on portrait). SVGs
draw only the playing surface and its markers, in real units (feet/yards).
The first version positioned text by hand inside one SVG canvas and it
clipped and overlapped as soon as real data and other screen sizes hit it —
don't go back to that. Fixed dark palette, not the app theme. A strip of
other live games sits along the bottom; tapping one overrides the automatic
pick until that game ends.

Several games at once (`live/multiGame.ts`, `live/GameTile.tsx`): with 2+
games live, the RedZone (one big + up to 3) or Grid (up to 6) layout,
picked by a switch next to Fullscreen ("Single" = the one-game display).
Games are ranked by `interest()` = `importance()` (how big the event is:
esports tier × stage from PandaScore, ESPN `postseason`; FRC always last,
followed or not, since the user is usually there in person —
the points table is `DEFAULT_RANKING` in `multiGame.ts`, and each user can
override any entry in Settings → Live display ranking (`eventRanking`, only
changed keys stored); the user set NFL regular season =
esports tier A, and a red-zone drive beats a Major's Swiss map but not its
final) + the strongest live moment capped at +35 (red zone from the ESPN
scoreboard's `situation`, a score in the last 3 minutes, a power play, a
close finish, a deciding map) + followed teams + 10 for a stream that plays
on the display − 20 for an esports match between maps (`mapLive` false,
from PandaScore's per-map status) — with a +15 bonus for games already shown so they don't churn on a close score or red-zone drive. When a game goes live, it gets that same +15 for one pass (`arrivals` in `placeGames`/`selectLiveEvent`), and ties go to the newer game, so a bigger new game takes over; ties between games already on screen keep their order.
Nothing is dropped for being small; unwanted sources are filtered in
settings. "Live" means `isLiveNow` (start time passed), same as the
dashboard. Layout "Auto" (default) picks Single / RedZone / Grid
from how the live games' standing (size + follow + stream, not moments)
compares, so it only changes as games start or end. Beside a big game
(55+), tier-D esports and FRC events stay in the strip unless pinned.
Quiet hours (`src/quietHours.ts`, per device, default 6 AM–12 PM — the user
works nights): layout unchanged, every stream loads muted (its player can still be unmuted by
hand), no in-tab chime. The in-tab chime is only for an
event going live; reminders are Discord's. Esports streams are ordered English first,
then main/official, then platform (PandaScore's language tags can be wrong:
a JP co-stream was tagged "en"). "Watch live" in the event detail opens
the Live tab with that game pinned (`LiveScreen`'s `pin` prop: a live game
is pinned like a strip tap, one not live yet gets the display to itself);
its stream links stay as "Open stream ↗". The in-app Streams tab is gone. Tap a
strip game to pin it to the big spot; drag games onto spots (pin/swap) or
onto the strip (hide). Single drags the same way: a strip game dropped on
the view is shown (like a tap), the shown game dropped on the strip is
hidden and the next pick takes over (hidden games are skipped by the
single pick unless nothing else is live). Layout, pins and hidden games are per device
(localStorage), pruned when their games end. Tiles stay mounted while
they move between grid areas, so a stream doesn't reload. Each sport's
surface is a shared component (`FootballSurface`, `HockeySurface`,
`BasketballSurface`, `BaseballSurface`, `F1Track`) used by both the full
view and the tiles.

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
| /live team sports | ESPN game summary (unofficial) | No | Shot/pitch coordinates, drives, box stats — quirks below |
| /live F1 | F1 live timing, SignalR Core | No | Anonymous; old /signalr and /static/ archive 401 as of 2026-10-20. `Position.z`/`CarData.z` are NOT sent anonymously (checked live, 2026 US GP) — cars are placed from TimingData mini-sectors instead, and in a race by gap to the leader (`f1Live.ts`, `F1View.tsx`) |
| /live F1 circuit | MultiViewer circuits API | No | Outline + marshal sectors, same coords as Position.z (no pit lane shape — it's drawn beside the S/F straight) |
| /live MLB extras | MLB Stats API (statsapi.mlb.com) | No | Ballpark fence distances (venue fieldInfo) and every batted ball (hitData); matched to the ESPN game by date + team names (`liveMlb.ts`) |

**ESPN summary quirks the /live views rely on** (all checked against real
responses 2026-10-20): football play `yardLine` is yards from the *home*
goal line, and `yardsToEndzone == yardLine` means the offense attacks the
home goal; NBA shot `coordinate.y` is feet from the rim (not the baseline),
with a `-214748340` sentinel on free throws; NHL plays set `shootingPlay`
on hits/giveaways too, so filter by `type.text`, and each play's `strength`
is relative to its own team; MLB `pitchCoordinate` is gamecast pixels, with
the strike zone fitted at roughly x 82–145, y 146–194. Stats API hit
coordinates convert to feet as 2.5 × (coordX − 125.42), 2.5 × (198.27 − coordY)
— checked against its own totalDistance (386 ft liner lands at 387 ft).

**PandaScore esports slugs are not always the obvious name** — e.g. Rocket
League is `rl`, not `rocket-league`. This was a real bug once; verify any
new title's slug against a real API response before assuming it.

**FRC districts:** region names (FIM, FIT, etc.) come from two layered
sources — TBA's own `/district/{key}/events/keys` data first, then a
static state→district fallback table in `frc.ts` for events TBA doesn't
officially tag under a district (e.g. off-season events). The static table
was derived from real 2026 season data, not guessed.

## Settings model

Two tiers, both in `backend/src/settings.ts`, both persisted **outside the
repo** under `~/.event-dashboard/` so they survive every deploy:

- **Global (admin-only)** — just the two external API credentials
  (`pandaScoreApiKey`, `tbaApiKey`), in `GlobalSettings`, persisted to
  `~/.event-dashboard/settings.json`. One shared file — everyone hits the
  same rate limit either way, but only an admin uid (see `ADMIN_UID` below)
  can see whether a key is set or change it. Served by
  `routes/globalSettings.ts` at `/api/global-settings`; never touched by
  `routes/settings.ts`.
- **Per-user** — everything else (favorite teams, source filters, theme,
  notification prefs, FRC team follow, etc.), in `UserSettings`, persisted
  one file per Authentik user at
  `~/.event-dashboard/users/<uid>/settings.json`. Served by
  `routes/settings.ts` at `/api/settings`, scoped to the requesting user via
  `userContext.ts`'s `getUserId()`, which reads the `X-authentik-uid` header
  Traefik/Authentik forwards on every request. No header (e.g. bare
  `bun run dev` without Traefik in front) falls back to a fixed `"local"`
  user (`DEFAULT_USER_ID` in `settings.ts`) so local iteration still works.

`ADMIN_UID` (env var, comma-separated for multiple) controls who can hit
`/api/global-settings` — defaults to just `"local"`, so it works out of the
box for bare `bun run dev` but needs to be set to the owner's real Authentik
uid once actually deployed behind Traefik.

Any route that reads user-facing prefs must call `readUserSettings(getUserId(req))`,
never a global read — and any route making an internal self-fetch back into
this backend (see `routes/ics.ts`) must forward `X-authentik-uid` explicitly,
since that header isn't otherwise present on a server-to-server `fetch()`.

`SettingsContext.tsx` on the frontend fetches both `/api/settings` and
`/api/global-settings` and merges them into one client-side state object —
`save()` routes `pandaScoreApiKey`/`tbaApiKey` to the global endpoint and
everything else to the per-user one, so callers don't need to care which
store actually owns a given field.

The old single shared `settings.json` (one file, no per-user concept) is
auto-migrated on first run of the new code — see the comment on
`migrateLegacySettingsIfNeeded()` in `settings.ts` for exactly how the split
happens and where the pre-existing data ends up.

**When adding a new settings field:** decide which tier it belongs in (almost
certainly per-user — the global tier is deliberately just the two API keys),
give it a sensible default in `USER_DEFAULTS` or `GLOBAL_DEFAULTS`, and if
the *type* of an existing field ever changes (e.g. number → array), add a
migration step in `readUserSettings()`/`readGlobalSettings()`. A real
production bug happened once from skipping this — an existing
`settings.json` on disk still had the old shape, and the frontend crashed
calling array methods on what was actually still a number.

## Conventions

- **Git:** default branch is `main`, never `master`. No Claude/AI
  attribution anywhere in commit messages or history (no
  `Co-Authored-By`, nothing referencing Claude). When a change is finished
  and checked (typecheck, build, a real run), commit and push it to `main`
  without asking, then confirm the Coolify deploy finished (changed
  2026-10-21; this repo used to be manual-commit only). Show the real
  command output — never claim a commit or deploy succeeded without it.
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

- `backend/src/espnScoreboard.ts`'s `liveDetail` field — **confirmed**
  2026-10-20 against live games: NBA `"1:23 - 2nd"`/`"Halftime"`, NHL
  `"16:34 - 2nd"`/`"End of 1st"`.
- /live, not yet seen against real data: the esports stream crop with a real PandaScore match (only
  tested with a faked event + YouTube video, no PandaScore key on the dev
  box), the FRC view (no TBA key on the dev box), and NFL/MLB mid-game
  (mapping tested on finished games and a replayed mid-drive play). The
  default minimap crop rects in `live/cropPresets.ts` are guesses.
- The stream-source popup in `EventDetailModal.tsx` — **confirmed** against
  a real live PandaScore match (LEC, SK Gaming vs Fnatic, 2026-08-15).
  Real `streams_list` had 5 entries across 4 languages with the official
  English Twitch stream marked `"main": true`; the app correctly still
  ranked YouTube first and picked the official Twitch link over the other
  language duplicates.
- FRC district-matching — **a real bug was found and fixed** 2026-08-15:
  `state_prov` codes aren't globally unique (`"WA"` is both Washington,
  USA and Western Australia), so the `STATE_TO_DISTRICT` fallback in
  `frc.ts` mislabeled a real Australian event ("West Australian Robotics
  Playoffs", key `2026auwarp`) as region "PNW" (a US Pacific Northwest
  district). Fixed by gating the fallback on `e.country` being
  USA/United States/Canada. Verified against live 2026 TBA data that this
  was the only such collision this season, and that real PNW events
  (Oregon/Washington, USA) still resolve correctly.

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
- **No `<button>` inside a `<button>`.** The old UI's `EventCard` (deleted
  with that UI) once nested the Finished tab's Dismiss × inside a button
  card: invalid HTML, only caught by a React console warning on a real run.
  A clickable card with its own buttons inside should be a
  `<div role="button" tabIndex={0}>` with Enter/Space handling, the inner
  buttons calling `stopPropagation()`.
