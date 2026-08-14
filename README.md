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

## Building the distributable .exe

```bash
bun run build:exe
```

This runs `build:ui`, zips the result into `backend/ui-dist.zip` (via
`scripts/zip-ui.ts` — a plain JS zip implementation, not the `zip` command,
so this works identically on Windows), then compiles the backend with that
zip embedded into a single Windows executable: `Event-Dashboard.exe`.
Double-click it — no Bun install required on the machine running it.

> **Note on `backend/ui-dist.zip`:** an empty placeholder version of this
> file is committed to the repo. That's intentional — the backend statically
> imports it (required for Bun to know what to embed into the `.exe`), so
> without *some* file there, even `bun run dev` would fail to start before
> you'd ever built the UI once. `build:exe` overwrites it with the real
> bundle each time you run it.

## Releasing a new version

Push a version tag:

```bash
git tag v1.1.0
git push origin v1.1.0
```

`.github/workflows/release.yml` picks this up, builds `Event-Dashboard.exe`
on GitHub's servers, renames it to `Event-Dashboard-1.0.exe`, and publishes
it as a GitHub release — automatically, no local Windows machine or Bun
install needed to produce it. Anyone can then just download the latest
release and double-click it.

## Main page

- **Click any event** — card, calendar day, or hourly breakdown — for a
  detail view: teams/players with logos and records where available, a
  "Watch live" button (prioritized YouTube, then Twitch, then anything else)
  when a stream link exists, best-of series scores (e.g. "2-1 (Bo3)"),
  venue, and other facts. When a source (mainly PandaScore) gives no direct
  match link, it falls back to that league's own Liquipedia page (e.g. the
  LCK page) rather than a generic search, since that's where the actual
  standings/schedule/context live. A "Hide this league" button there adds
  it to your exclusions in one click — no need to find and type it
  elsewhere.
- Team logos (next to each team's name) and the series score also show
  directly on the main-page cards, not just in the detail view.
- **Follow event** — on the detail view, a one-click way to follow one
  specific event without adding a whole team as a favorite. Requests
  notification permission the first time (browser-native prompt), turns on
  the global notify-on-live setting, and tags that exact event so it
  survives the calendar feed's "favorites only" mode even without a
  team-name match. Independent of the Favorite teams feature — this is a
  one-off follow, not a standing preference.
- **Add to Google Calendar** — on the detail view, opens Google Calendar
  pre-filled with the event name, date/time, teams, and any stream/info
  link. Uses Google's public "create event" URL, which needs **no API key
  or sign-in on this end** — you just confirm and save it on Google's side.
  A calendar you *subscribe to by URL* (see Calendar feed below) is a
  read-only synced mirror, so there's no way for a button to push a single
  event into one directly; true one-click silent insert into your primary
  calendar would need real Google OAuth, which isn't built.
- **+ Add Event** — opens the custom events panel directly (name, league,
  color, start time, duration as hours + minutes, optional link). Moved
  here from Settings since it's something you'll reach for often, not a
  one-time config.
- **Select all / Deselect all** — next to the sport filter chips, for
  quickly narrowing to just what you want to look at right now.
- **Calendar** — toggles the Live/Upcoming list for a month calendar (equal-
  width days), with a "Live now" strip at the top for anything currently
  live and a live indicator on matching day-cell entries. Multiple same-day
  events for one sport collapse to shorthand (e.g. "5x League of Legends");
  click any day for an hourly breakdown.

## Settings menu

Click **Settings** for:
- **PandaScore API key** — shared across every esports title, so it lives
  here rather than in any one source's group. Free key at pandascore.co.
- **Data sources** — one collapsible group per source (NFL, NBA, NHL, F1,
  FRC, and every esports title in the catalog). Anything that only affects
  a single source lives inside that source's own group, not scattered
  across separate sections:
  - **On/off** — a quick chip row at the top toggles any source at a
    glance without opening its group; saves instantly, no Save button, no
    reload needed (the whole app shares one live settings state). Add more
    esports titles by editing `backend/src/esportsCatalog.ts` (double-check
    the PandaScore slug — it's not always the obvious name, e.g. Rocket
    League is `rl`); add more ESPN-covered sports (e.g. MLB) via
    `backend/src/espnScoreboard.ts`'s router factory.
  - **Color** — every sport's default is spaced 30° apart around the color
    wheel so no two are easily confused, but click the colored dot right
    next to a source's name to pick your own — applies everywhere (cards,
    calendar, filter chips, detail view), with a "Reset color to default"
    link in that source's expanded group once you've customized it.
  - **League filters** — collapsible chips built from whatever leagues are
    currently showing up in your data, so a one-off tournament doesn't
    clutter this forever once it's gone.
  - **FRC's group specifically** also holds its own Blue Alliance API key
    and a **region picker** (e.g. FIM, FIT, or a plain state code like GA
    for non-districted regionals), an include-list since picking the 2-3
    regions you care about beats excluding everywhere else. (Following a
    specific team lives under the main Favorite teams section now, not
    here — see below.) District names
    come from both TBA's own district-events data and a static
    state-to-district table (`backend/src/routes/frc.ts`), so off-season
    events TBA doesn't officially tag under a district's competition series
    (e.g. MARC, an off-season Michigan event) still show the right region.
    FRC cards also show current competition status when the event is
    happening today — a qual match count ("Qual Match 23 of 40") or
    playoff round/match ("Semifinals — Match 2"), computed from TBA's match
    data the same way the FRC Commentary Dashboard project does it.
  - **Export/Import** at the bottom move all of this to a new machine —
    import shows an in-app confirmation before overwriting anything, never
    a browser popup. Export deliberately leaves out your API keys for
    safety, so those need re-entering once after an import.

Custom events and all settings are saved to `~/.event-dashboard/settings.json`,
**outside the git repo**, so they survive every future code sync/deploy
untouched. All of this is server-side state, not browser storage — it's
what "stored locally" means here: it lives in a file on your machine, never
sent anywhere but each service's own API and back to your own browser.

## Quality-of-life features

- **Favorite teams** — a Settings section, separate from any one source,
  for team names to watch across every sport, FRC included. Matched
  case-insensitively against each event's team list and gives the same
  "★ Your team" badge. Since matching is substring-based, a short nickname
  can span sports by accident (e.g. "Falcons" would match both the Atlanta
  Falcons and CS's Team Falcons) — type the fuller name to disambiguate
  (e.g. "Atlanta Falcons" vs "Team Falcons"). For FRC specifically, add a
  team **number** instead (e.g. "254") — FRC events don't carry a team
  roster the way other sources do, so a numeric entry here is
  automatically used to drive FRC's own exact-match team lookup under the
  hood, rather than needing a second separate field.
- **Follow event** (detail view) tags one specific event rather than a
  whole team — shows a separate "📌 Followed event" badge from the
  team-based "★ Your team" one, so you can tell at a glance which kind of
  follow got something onto your radar. Custom events are always
  considered followed automatically, since adding one is already an
  explicit statement of interest.
- **Notifications** — once granted, get a browser notification the moment
  a followed event goes live. Choose in Settings between **"Every live
  event"** across every enabled source, or **"Followed teams only"** (the
  default — just events matching a favorite/followed team). A separate
  chip row lets you pick any combination of advance reminders — e.g. both
  "30 min before" and "At start" at once, not just one. A short
  synthesized ping (no audio file needed) plays alongside the browser
  notification, muteable separately. Want notifications off for one
  specific event without unfollowing it? Hit **Snooze notifications** on
  that event's detail view.
- **New-event highlight** — a small "NEW" badge on any card you haven't
  seen before, tracked across visits (not just within one session).
- **Offline fallback** — if every data source is unreachable at once
  (likely means you're offline), the dashboard falls back to the last
  successfully-loaded snapshot instead of going blank, with a clear
  "Offline, showing cached data" indicator next to the sync timestamp.
- **Click a team name** (detail view) to jump straight to a search
  filtered to just that team — reuses the same search bar rather than
  being a separate feature, so it behaves exactly like typing the name
  yourself would.
- **Compact layout** — a denser card grid for scanning more at a glance,
  toggle in Settings next to Theme.
- **Timezone override** — show every event time in a specific zone instead
  of your browser's local one, picked from a dropdown of common zones.
  (The calendar's month-grid day-grouping itself stays on local time even
  with an override set — only the displayed clock times respect it; fully
  timezone-correct day bucketing would need a bigger rewrite.)
- **Today / Agenda view** and **Finished view** — two extra view modes
  next to List and Calendar. Today is a flat chronological list of every
  event happening today, including ones that already finished. Finished
  holds recently-completed events (a uniform 7-day shelf life across every
  source) instead of letting them vanish the instant they end — dismiss
  (×) the ones you're done with; everything else sticks around for a
  while so you can catch up later. (Esports matches don't currently get
  this shelf life — PandaScore's own query only ever asks for
  in-progress/upcoming matches, so a finished one disappears from that API
  entirely, not just from the display.)
- **Live game clock** — NFL/NBA/NHL cards show the current period/clock
  (e.g. "Q3 8:42") when a game is actually in progress, pulled from ESPN's
  own live-status field.
- **Search** — filters every view by event name, team, or league.
- **Calendar feed** — `/calendar.ics` on the backend aggregates every
  currently-enabled source (respecting your saved settings — disabled
  sources and excluded leagues) into a real subscribable calendar feed.
  Point Google Calendar, Apple Calendar, or Outlook's "subscribe by URL" at
  it and it stays in sync automatically — a subscribed calendar is a
  read-only mirror of this feed, so there's no way for a button on an
  individual event to "push" into it; the feed itself is what controls
  what shows up. For finer control than whole sports/leagues, a
  **"favorites only"** toggle in Settings narrows the feed down to just
  the teams/events you've followed (custom events always stay included
  either way). The one-off "Add to Google Calendar" button on
  individual events is separate — it uses Google's own unauthenticated
  "create event" link, which is why it opens a confirm page instead of
  adding silently; true one-click silent insert would need real Google
  OAuth, which isn't built.
- **Refresh interval** — how often the dashboard polls for new data,
  configurable in Settings (minimum 15s).
- **Light theme** — a full second color palette, toggled in Settings.
- **PWA install** — a manifest is linked, so mobile browsers offer to add
  it to your home screen like a native app.

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
