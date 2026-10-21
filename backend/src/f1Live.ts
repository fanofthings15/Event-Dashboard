import { inflateRawSync } from "zlib";
import { cached } from "./cache.js";

// F1's own live-timing feed (the one FastF1 and MultiViewer read), over
// SignalR Core. Checked 2026-10-20: the older /signalr endpoint and the
// /static/ session archive both answer 401 now, but /signalrcore still
// accepts an anonymous negotiate + Subscribe, and the Subscribe reply is a
// full snapshot of the most recent session (DriverList, TimingData,
// TrackStatus, RaceControlMessages, LapCount, SessionInfo all present).
//
// NOT yet verified: whether Position.z (car x/y) streams anonymously
// during a live session — it was absent from the post-session snapshot.
// The display treats car dots as optional and falls back to the timing
// tower alone when no positions arrive.
//
// The connection is opened on demand — only while the /live display is
// actually asking for F1 data — and dropped after IDLE_MS without a
// request, so the server isn't holding a socket open all week.

const BASE = "https://livetiming.formula1.com/signalrcore";
const TOPICS = [
  "SessionInfo",
  "TrackStatus",
  "RaceControlMessages",
  "DriverList",
  "TimingData",
  "LapCount",
  "ExtrapolatedClock",
  "TimingAppData",
  "Position.z",
];
const RS = "\x1e"; // SignalR JSON protocol record separator
const IDLE_MS = 5 * 60 * 1000;

let ws: WebSocket | null = null;
let connecting = false;
let lastRequestAt = 0;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let lastError: string | undefined;
const state: Record<string, any> = {};

// Live-timing deltas patch the snapshot in place. Arrays arrive as objects
// keyed by index (e.g. RaceControlMessages {"Messages": {"25": {...}}}), so
// an object merged onto an array writes by index rather than replacing it.
function deepMerge(target: any, patch: any): any {
  if (patch === null || typeof patch !== "object") return patch;
  if (Array.isArray(patch)) return patch;
  if (Array.isArray(target)) {
    const arr = [...target];
    for (const [k, v] of Object.entries(patch)) {
      const i = Number(k);
      if (Number.isInteger(i)) arr[i] = deepMerge(arr[i], v);
    }
    return arr;
  }
  const out = target && typeof target === "object" ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(out[k], v);
  return out;
}

// ".z" topics are base64 raw-deflate JSON.
function decodeZ(data: unknown): any {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(inflateRawSync(Buffer.from(data, "base64")).toString("utf8"));
  } catch {
    return undefined;
  }
}

function applyTopic(topic: string, data: any) {
  if (topic.endsWith(".z")) {
    const decoded = decodeZ(data);
    if (decoded !== undefined) state[topic.slice(0, -2)] = decoded; // positions are whole frames, not deltas
    return;
  }
  state[topic] = deepMerge(state[topic], data);
}

function onMessage(raw: string) {
  for (const part of raw.split(RS)) {
    if (!part) continue;
    let msg: any;
    try {
      msg = JSON.parse(part);
    } catch {
      continue;
    }
    if (msg.type === 3 && msg.result) {
      for (const [topic, data] of Object.entries(msg.result)) applyTopic(topic, data);
    } else if (msg.type === 1 && msg.target === "feed" && Array.isArray(msg.arguments)) {
      applyTopic(msg.arguments[0], msg.arguments[1]);
    } else if (msg.type === 7) {
      lastError = msg.error ?? "server closed the connection";
    }
  }
}

function close() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  ws?.close();
  ws = null;
}

async function connect() {
  if (connecting || ws) return;
  connecting = true;
  try {
    const neg = await fetch(`${BASE}/negotiate?negotiateVersion=1`, { method: "POST" });
    if (!neg.ok) throw new Error(`negotiate responded ${neg.status}`);
    // The load balancer's sticky-session cookie has to come along on the
    // socket, or the upgrade can land on a node that never saw the negotiate.
    const cookie = (neg.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const { connectionToken } = (await neg.json()) as { connectionToken: string };

    const socket = new WebSocket(`wss://livetiming.formula1.com/signalrcore?id=${encodeURIComponent(connectionToken)}`, {
      headers: cookie ? { Cookie: cookie } : {},
    } as any);
    ws = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ protocol: "json", version: 1 }) + RS);
      socket.send(JSON.stringify({ type: 1, target: "Subscribe", arguments: [TOPICS], invocationId: "0" }) + RS);
      pingTimer = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 6 }) + RS), 15_000);
      lastError = undefined;
    };
    socket.onmessage = (m) => onMessage(String(m.data));
    socket.onerror = () => {
      lastError = "live timing connection error";
    };
    socket.onclose = () => {
      if (ws === socket) {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        ws = null;
      }
    };
  } catch (err) {
    lastError = String(err);
    ws = null;
  } finally {
    connecting = false;
  }
}

setInterval(() => {
  if (ws && Date.now() - lastRequestAt > IDLE_MS) close();
}, 60_000).unref?.();

// ---------- circuit outline ----------

export interface Circuit {
  x: number[];
  y: number[];
  rotation: number;
  marshalSectors: { number: number; x: number; y: number }[];
}

// MultiViewer's circuit API (same coordinate space as Position.z). It only
// has a layout per year it has processed — the 2026 request returned the
// 2023 layout for Singapore — so a 404 falls back a year at a time.
async function fetchCircuit(circuitKey: number, year: number): Promise<Circuit | null> {
  return cached(`f1:circuit:${circuitKey}:${year}`, 24 * 60 * 60, async () => {
    for (let y = year; y >= year - 3; y--) {
      const r = await fetch(`https://api.multiviewer.app/api/v1/circuits/${circuitKey}/${y}`, {
        headers: { "User-Agent": "event-dashboard" },
      });
      if (!r.ok) continue;
      const c: any = await r.json();
      return {
        x: c.x,
        y: c.y,
        rotation: c.rotation ?? 0,
        marshalSectors: (c.marshalSectors ?? []).map((s: any) => ({ number: s.number, x: s.trackPosition?.x, y: s.trackPosition?.y })),
      };
    }
    return null;
  });
}

// ---------- public state ----------

export interface F1Driver {
  number: string;
  tla: string;
  team: string;
  color: string;
  position: number;
  gap?: string;
  interval?: string;
  inPit: boolean;
  out: boolean; // retired or stopped
  compound?: string; // current tyre: SOFT, MEDIUM, HARD, INTERMEDIATE, WET
  stops: number;
  x?: number;
  y?: number;
}

export interface F1LiveState {
  kind: "f1";
  connected: boolean;
  error?: string;
  session?: { meeting: string; name: string; status: string; circuitKey?: number; year?: number };
  trackStatus?: { code: string; message: string };
  lap?: { current: number; total: number };
  drivers: F1Driver[];
  yellowSectors: number[];
  raceControl: { utc: string; message: string; flag?: string }[];
  circuit?: Circuit | null;
  positionsAvailable: boolean;
  // Most recent first: the lap and tyre change, from the stint history.
  pitStops: { number: string; tla: string; color: string; lap: number; from?: string; to?: string }[];
}

// Race control reports flags per marshal sector ("YELLOW IN TRACK SECTOR 9",
// later "CLEAR IN TRACK SECTOR 9"); a track-wide CLEAR/GREEN resets them all.
function activeYellowSectors(messages: any[]): number[] {
  const active = new Set<number>();
  for (const m of messages) {
    if (m?.Category !== "Flag") continue;
    if (m.Scope === "Sector" && typeof m.Sector === "number") {
      if (m.Flag === "YELLOW" || m.Flag === "DOUBLE YELLOW") active.add(m.Sector);
      else if (m.Flag === "CLEAR" || m.Flag === "GREEN") active.delete(m.Sector);
    } else if (m.Scope === "Track" && (m.Flag === "CLEAR" || m.Flag === "GREEN" || m.Flag === "CHEQUERED")) {
      active.clear();
    }
  }
  return [...active].sort((a, b) => a - b);
}

export async function getF1LiveState(): Promise<F1LiveState> {
  lastRequestAt = Date.now();
  if (!ws) await connect();

  const info = state.SessionInfo;
  const drivers = state.DriverList ?? {};
  const lines = state.TimingData?.Lines ?? {};
  const appLines = state.TimingAppData?.Lines ?? {};
  const positionFrames: any[] = state.Position?.Position ?? [];
  const latestPositions = positionFrames.at(-1)?.Entries ?? {};

  const list: F1Driver[] = Object.entries(drivers)
    .filter(([num]) => /^\d+$/.test(num))
    .map(([num, d]: [string, any]) => {
      const t = lines[num] ?? {};
      const p = latestPositions[num];
      const stints: any[] = Object.values(appLines[num]?.Stints ?? {});
      return {
        number: num,
        tla: d.Tla ?? num,
        team: d.TeamName ?? "",
        color: d.TeamColour ? `#${d.TeamColour}` : "#888888",
        position: Number(t.Position ?? d.Line ?? 99),
        gap: t.GapToLeader,
        interval: t.IntervalToPositionAhead?.Value,
        inPit: Boolean(t.InPit),
        out: Boolean(t.Retired || t.Stopped),
        compound: stints.at(-1)?.Compound,
        stops: Math.max(0, stints.length - 1),
        x: typeof p?.X === "number" ? p.X : undefined,
        y: typeof p?.Y === "number" ? p.Y : undefined,
      };
    })
    .sort((a, b) => a.position - b.position);

  const circuitKey: number | undefined = info?.Meeting?.Circuit?.Key;
  const year = info?.StartDate ? new Date(info.StartDate).getFullYear() : undefined;
  let circuit: Circuit | null | undefined;
  if (circuitKey && year) {
    try {
      circuit = await fetchCircuit(circuitKey, year);
    } catch {
      circuit = null;
    }
  }

  // A stop happens at the end of every stint but the last: its lap is the
  // laps run so far (each stint's TotalLaps counts any laps the tyre had
  // before it went on, hence minus StartLaps).
  const pitStops: F1LiveState["pitStops"] = [];
  for (const d of list) {
    const stints: any[] = Object.values(appLines[d.number]?.Stints ?? {});
    let lap = 0;
    stints.forEach((s, i) => {
      if (i > 0) {
        pitStops.push({ number: d.number, tla: d.tla, color: d.color, lap, from: stints[i - 1].Compound, to: s.Compound });
      }
      lap += (Number(s.TotalLaps) || 0) - (Number(s.StartLaps) || 0);
    });
  }
  pitStops.sort((a, b) => b.lap - a.lap);

  const messages: any[] = state.RaceControlMessages?.Messages ?? [];
  return {
    pitStops: pitStops.slice(0, 8),
    kind: "f1",
    connected: ws?.readyState === WebSocket.OPEN,
    error: lastError,
    session: info
      ? { meeting: info.Meeting?.Name ?? "", name: info.Name ?? "", status: info.SessionStatus ?? "", circuitKey, year }
      : undefined,
    trackStatus: state.TrackStatus ? { code: String(state.TrackStatus.Status), message: state.TrackStatus.Message } : undefined,
    lap: state.LapCount ? { current: state.LapCount.CurrentLap, total: state.LapCount.TotalLaps } : undefined,
    drivers: list,
    yellowSectors: activeYellowSectors(messages),
    raceControl: messages
      .slice(-3)
      .reverse()
      .map((m) => ({ utc: m.Utc, message: m.Message, flag: m.Flag })),
    circuit,
    positionsAvailable: list.some((d) => d.x !== undefined),
  };
}
