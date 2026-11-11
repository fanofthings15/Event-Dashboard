import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { embeddableStream, nativeControls, streamIdentity, type StreamOption } from "../streamEmbed";
import StreamControls from "./StreamControls";

export { embeddableStream };

const embedMuted = (embed: string) => /[?&]mute(d)?=(1|true)(&|$)/.test(embed);

export type Player = "youtube" | "twitch" | null;
const playerOf = (embed: string): Player =>
  /^https:\/\/(www\.)?youtube\.com\/embed\//.test(embed) ? "youtube" : embed.startsWith("https://player.twitch.tv/") ? "twitch" : null;

// Chrome-family browsers (IntersectionObserver v2) tell a frame whether
// anything is drawn over it, and Twitch's player watches that
// (trackVisibility in its own code): the moment anything covers it — a
// transparent layer, the old rounded-corner mask, a control bar, even for
// half a second — it stops, and it doesn't start again by itself (checked
// in headless Chrome 2026-11-06; Firefox has no such check, Twitch falls
// back to one that ignores covers; YouTube and Kick don't check). So there a
// Twitch box is "guarded": nothing visible ever overlaps its frame. Its
// corners are clipped rather than masked, the layer that catches the mouse
// is opacity 0 (which doesn't count), and the controls open as a drawer
// under the frame, which shrinks to make room (shrinking doesn't stop it,
// even at 533×300). Anything else on the page that covers it (a tile being
// dragged, a score banner) gets a Play once it's gone.
export const GUARD_TWITCH = typeof IntersectionObserverEntry !== "undefined" && "isVisible" in IntersectionObserverEntry.prototype;
const guarded = (embed: string) => GUARD_TWITCH && playerOf(embed) === "twitch";

// The same address with the sound on or off, in each player's own parameter.
function withMute(embed: string, muted: boolean): string {
  try {
    const u = new URL(embed);
    if (playerOf(embed) === "youtube") {
      if (muted) u.searchParams.set("mute", "1");
      else u.searchParams.delete("mute");
    } else u.searchParams.set("muted", muted ? "true" : "false");
    return u.toString();
  } catch {
    return embed;
  }
}

type Msg = "listen" | "mute" | "unmute" | "play" | "pause" | "volume" | "quality";

// Messages to a player that's already playing. YouTube: the IFrame API's
// postMessage protocol (the embed has enablejsapi=1); "listening" asks it to
// report its state back. Twitch: the messages Twitch's own embed script
// (embed.twitch.tv/embed/v1.js) sends the player.twitch.tv frame — Pause 2,
// Play 3, SetQuality 8, SetMuted 10, SetVolume 11 (0–1); the player reports
// its state on its own. All checked in headless Chrome (mute 2026-11-03;
// Twitch play, pause, volume and quality 2026-11-06, each confirmed by the
// state it reported after). Kick has no player API.
function send(frame: HTMLIFrameElement, player: Player, msg: Msg, arg?: number | string) {
  const win = frame.contentWindow;
  if (!win) return;
  if (player === "youtube") {
    if (msg === "quality") return; // setPlaybackQuality does nothing any more
    if (msg === "listen") {
      win.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "https://www.youtube.com");
      return;
    }
    const func = { play: "playVideo", pause: "pauseVideo", mute: "mute", unmute: "unMute", volume: "setVolume" }[msg];
    win.postMessage(JSON.stringify({ event: "command", func, args: msg === "volume" ? [arg] : [], id: 1, channel: "widget" }), "https://www.youtube.com");
  } else if (player === "twitch") {
    const cmd = { play: [3, null], pause: [2, null], mute: [10, true], unmute: [10, false], volume: [11, Number(arg) / 100], quality: [8, arg] }[msg as Exclude<Msg, "listen">];
    if (cmd) win.postMessage({ eventName: cmd[0], params: cmd[1], namespace: "twitch-embed-player-proxy" }, "https://player.twitch.tv");
  }
}

export type PlayState = "playing" | "buffering" | "paused" | "idle";
export interface Quality {
  group: string; // what SetQuality takes ("chunked", "720p60")
  name: string; // what to show ("1080p60 (source)")
}

interface Report {
  muted?: boolean;
  volume?: number; // 0–100
  state?: PlayState;
  error?: number; // the player can't play and shows a screen of its own
  qualities?: Quality[];
  quality?: string;
}

// YouTube playerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3
// buffering, 5 cued. Twitch playback: Idle (what its own isPaused() checks),
// Ready, Buffering, Playing, Ended.
const YT_STATE: Record<number, PlayState> = { [-1]: "idle", 0: "paused", 1: "playing", 2: "paused", 3: "buffering", 5: "idle" };
const TW_STATE: Record<string, PlayState> = { Idle: "paused", Ended: "paused", Ready: "idle", Buffering: "buffering", Playing: "playing" };

// What a player says about itself, from one of its messages.
function readReport(data: unknown): Report | null {
  let d: any;
  try {
    d = typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return null; // not a player message
  }
  if (!d || typeof d !== "object") return null;
  if (d.event === "onStateChange" && typeof d.info === "number") return { state: YT_STATE[d.info] };
  // YouTube can't play it and shows its own screen instead — an unavailable
  // video (150, checked in headless Chrome), or a "sign in to confirm you're
  // not a bot" prompt (2026-11-11, on the user's screen) — and reports no
  // play state at all, so it never looked stopped and never got clicks
  if (d.event === "onError") return { error: typeof d.info === "number" ? d.info : 0 };
  if (d.info && typeof d.info === "object") {
    const i = d.info;
    const r: Report = {};
    if (typeof i.muted === "boolean") r.muted = i.muted;
    if (typeof i.volume === "number") r.volume = i.volume;
    if (typeof i.playerState === "number") r.state = YT_STATE[i.playerState];
    return r;
  }
  if (d.namespace === "twitch-embed-player-proxy" && d.params && typeof d.params === "object") {
    const p = d.params;
    const r: Report = {};
    if (typeof p.muted === "boolean") r.muted = p.muted;
    if (typeof p.volume === "number") r.volume = Math.round(p.volume * 100);
    if (typeof p.playback === "string") r.state = TW_STATE[p.playback];
    if (typeof p.quality === "string") r.quality = p.quality;
    if (Array.isArray(p.qualitiesAvailable))
      r.qualities = p.qualitiesAvailable
        .filter((q: any) => typeof q?.group === "string" && q.group !== "auto")
        .map((q: any) => ({ group: q.group, name: typeof q.name === "string" ? q.name : q.group }));
    return r;
  }
  return null;
}

// The volume last set with the display's slider, per device: every stream
// starts at it, whichever service it's on.
const VOLUME_KEY = "live-volume";
function savedVolume(): number | undefined {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
function saveVolume(v: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
  } catch {
    // private window: it still applies to the streams playing now
  }
}

export interface Entry {
  id: string;
  embed: string; // the address as last asked for, including its mute setting
  box: HTMLDivElement;
  frame: HTMLIFrameElement;
  host: HTMLDivElement; // the controls are rendered into this, over the frame
  slot: HTMLElement | null;
  pendingSrc?: string;
  drop?: ReturnType<typeof setTimeout>;
  confirm?: ReturnType<typeof setInterval>;
  listen?: ReturnType<typeof setInterval>;
  muted?: boolean; // as the player last reported it
  paused?: boolean; // as the player last reported it
  resumeUntil?: number; // just went fullscreen while playing: a pause now is undone
  resumedAt?: number;
  placed: string;
  volume?: number; // 0–100, as last reported or set
  volumeSetAt?: number;
  volumeSynced: boolean; // the player has reported the saved volume since this load (or stopped being asked)
  volumeTries?: number;
  state?: PlayState;
  stateAt: number;
  handPaused: boolean; // paused with the display's own button
  playAskedAt?: number; // Play pressed while it wasn't playing
  error?: number; // the player reported it can't play (YouTube onError)
  qualities?: Quality[];
  quality?: string;
  native: boolean; // the player's own controls instead of the display's
  pseudoFs: boolean; // filling the window where real fullscreen isn't possible (iPhone)
  revive?: ReturnType<typeof setInterval>; // a guarded Twitch player that stopped by itself is told to play
  version: number;
  subs: Set<() => void>;
}

// What the controls show, read from an entry.
export interface StreamView {
  player: Player;
  muted: boolean;
  volume: number;
  state?: PlayState;
  stateAt: number;
  handPaused: boolean;
  playAskedAt?: number;
  error?: number;
  qualities: Quality[];
  quality?: string;
  native: boolean;
  fullscreen: boolean;
  guard: boolean; // nothing may be drawn over the frame (GUARD_TWITCH)
}

// Fired on document when a stream fills the window without the Fullscreen
// API, or stops, so the display can hold still just as for real fullscreen.
export const STREAM_FULLSCREEN_EVENT = "lv-stream-fullscreen";

// True while one stream fills the screen: in its own player's fullscreen
// (the player's own controls), in the display's, or filling the window.
export function isStreamFullscreen(): boolean {
  const fs = document.fullscreenElement;
  return fs instanceof HTMLIFrameElement || Boolean(fs?.classList.contains("lv-stream-float")) || Boolean(document.querySelector(".lv-pseudo-fs"));
}

// The stream fills the screen: in its own player's fullscreen, the box's,
// or filling the window with the page fullscreen behind it (phones).
function filling(e: { frame: Element; box: Element; pseudoFs: boolean }, fs: Element | null): boolean {
  return fs === e.frame || fs === e.box || (e.pseudoFs && fs === document.documentElement);
}

// A stream's box sits in the layer, not in its tile, so hit-testing the
// screen finds the box: this maps it back to the placeholder in the tile.
const boxEntries = new WeakMap<Element, Entry>();
export function streamSlotAt(el: Element | null): HTMLElement | null {
  const box = el?.closest(".lv-stream-float");
  return box ? (boxEntries.get(box)?.slot ?? null) : null;
}

// Every stream player on the live display lives here, in one layer of the
// page that React never re-renders: a Stream is only a placeholder, and its
// player is laid over it, following it every frame. So a player is never
// rebuilt or moved in the page — the browser reloads an iframe that is —
// when the view changes around it: Single becoming RedZone (a new game
// going live used to restart the stream you were watching and drop you out
// of the player's fullscreen), a tile moving spots, or a tile changing shape.
// A stream that leaves the screen is removed a moment later, unless a new
// placeholder (the same stream in its new spot) claims it first.
//
// The sound moving between tiles is a mute/unmute message, confirmed from
// what the player reports and sent again until it matches. A player that
// hasn't confirmed within 8 s is reloaded with the right setting, so a
// stream that should be quiet can never stay playing in the background —
// a command sent while a player was still loading used to be ignored, and
// two streams' audio played at once until the page was refreshed.
//
// The players' own controls are off (toEmbedUrl); StreamControls draws one
// set for every service over each player, in the box, so it goes fullscreen
// with it. Those controls act through the methods below.
export class StreamLayer {
  private entries = new Map<string, Entry>();
  private layer: HTMLDivElement | null = null;
  private raf = 0;
  private listening = false;
  private pointer: { x: number; y: number } | null = null;
  // the stream that put the whole page fullscreen (phones: see toggleFullscreen)
  private rootFsFor: Entry | undefined;

  private onMessage = (ev: MessageEvent) => {
    for (const e of this.entries.values()) {
      if (e.frame.contentWindow !== ev.source) continue;
      const r = readReport(ev.data);
      if (!r) return;
      let changed = false;
      if (r.state !== undefined && r.state !== e.state) {
        if (r.state === "paused" && (e.state === "playing" || e.state === "buffering") && !e.handPaused && guarded(e.embed)) this.revive(e);
        e.state = r.state;
        e.stateAt = Date.now();
        changed = true;
        if (r.state === "playing") {
          e.handPaused = false;
          e.playAskedAt = undefined;
          e.error = undefined;
        }
      }
      if (r.error !== undefined && r.error !== e.error) {
        e.error = r.error;
        changed = true;
      }
      if (r.state === "paused" || r.state === "playing") {
        e.paused = r.state === "paused";
        if (e.paused) this.resumeIfFullscreened(e);
      }
      if (r.muted !== undefined) {
        if (r.muted !== e.muted) changed = true;
        e.muted = r.muted;
        if (e.listen) {
          clearInterval(e.listen);
          e.listen = undefined;
        }
      }
      if (r.volume !== undefined) {
        // The saved volume is asked for until the player reports it (its
        // first reports come before it takes commands), at most 10 times — a
        // muted Twitch player keeps reporting its old level; it gets the
        // saved one again when it's unmuted (applyEmbed).
        const saved = savedVolume();
        if (!e.volumeSynced && saved !== undefined && Math.abs(saved - r.volume) >= 1 && (e.volumeTries ?? 0) < 10) {
          if (Date.now() - (e.volumeSetAt ?? 0) > 1000) {
            e.volumeTries = (e.volumeTries ?? 0) + 1;
            this.setVolumeLevel(e, saved);
            changed = true;
          }
        } else {
          e.volumeSynced = true;
          if (r.volume !== e.volume && Date.now() - (e.volumeSetAt ?? 0) > 1500) {
            // (a report just after the slider moved can still carry the old level)
            e.volume = r.volume;
            changed = true;
          }
        }
      }
      if (r.quality !== undefined && r.quality !== e.quality) {
        e.quality = r.quality;
        changed = true;
      }
      if (r.qualities && r.qualities.map((q) => q.group).join() !== (e.qualities ?? []).map((q) => q.group).join()) {
        e.qualities = r.qualities;
        changed = true;
      }
      if (changed) this.notify(e);
      return;
    }
  };

  // A stream playing on the display paused itself the first time it was
  // put fullscreen (seen on the user's screen 2026-11-03; it couldn't be
  // reproduced here, where headless Chrome can't play the streams). For a
  // few seconds after a playing stream goes fullscreen, a pause it reports
  // is undone with a play command. A stream already paused, or paused with
  // the display's own button, is left alone.
  private onFullscreen = () => {
    const fs = document.fullscreenElement;
    // the page left fullscreen by itself (a phone's back gesture): the
    // stream that took it leaves too
    if (this.rootFsFor && fs !== document.documentElement) {
      const e = this.rootFsFor;
      this.rootFsFor = undefined;
      this.setPseudo(e, false);
    }
    for (const e of this.entries.values()) {
      e.placed = "";
      this.notify(e);
      if (!filling(e, fs) || e.paused === true) continue;
      e.resumeUntil = Date.now() + 6000;
      for (const ms of [800, 2000, 3500, 5000]) setTimeout(() => this.resumeIfFullscreened(e), ms);
    }
  };

  // A guarded Twitch player that stopped by itself (something covered it)
  // is told to play every 1.5 s for a while, until it does — whatever
  // covered it may still be there for a few seconds (a score banner).
  private revive(e: Entry) {
    this.stopRevive(e);
    const until = Date.now() + 15_000;
    e.revive = setInterval(() => {
      if (e.state === "playing" || e.handPaused || Date.now() > until || !this.entries.has(e.id)) return this.stopRevive(e);
      send(e.frame, "twitch", "play");
    }, 1500);
  }

  private stopRevive(e: Entry) {
    clearInterval(e.revive);
    e.revive = undefined;
  }

  private resumeIfFullscreened(e: Entry) {
    const now = Date.now();
    const fs = document.fullscreenElement;
    if (!e.paused || e.handPaused || !e.resumeUntil || now > e.resumeUntil || !filling(e, fs)) return;
    if (e.resumedAt && now - e.resumedAt < 700) return;
    e.resumedAt = now;
    send(e.frame, playerOf(e.embed), "play");
  }

  private onPointer = (ev: PointerEvent) => {
    this.pointer = { x: ev.clientX, y: ev.clientY };
  };

  // Escape leaves a stream that's filling the window — before the display
  // sees it, which would otherwise take Escape as Back. F puts a stream
  // fullscreen, or takes the one that is out of it (fullscreenStream).
  private onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      const e = [...this.entries.values()].find((x) => x.pseudoFs);
      if (!e) return;
      ev.stopPropagation();
      ev.preventDefault();
      this.setPseudo(e, false);
      return;
    }
    if ((ev.key === "f" || ev.key === "F") && !ev.repeat && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      const t = ev.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
      const e = this.fullscreenTarget();
      if (!e) return;
      ev.preventDefault();
      this.toggleFullscreen(e);
    }
  };

  // Which stream F means: the one already fullscreen (to leave it), else
  // the one under the mouse, else the one with the sound, else the biggest
  // on screen (the big spot, or Single's only one).
  private fullscreenTarget(): Entry | undefined {
    const shown = [...this.entries.values()].filter((e) => e.slot && e.box.style.visibility !== "hidden");
    const full = shown.find((e) => e.pseudoFs || document.fullscreenElement === e.box);
    if (full) return full;
    if (this.pointer) {
      const box = document.elementFromPoint(this.pointer.x, this.pointer.y)?.closest(".lv-stream-float");
      const hovered = box ? boxEntries.get(box) : undefined;
      if (hovered && shown.includes(hovered)) return hovered;
    }
    const area = (e: Entry) => e.box.offsetWidth * e.box.offsetHeight;
    return shown.find((e) => !this.mutedNow(e)) ?? shown.sort((a, b) => area(b) - area(a))[0];
  }

  private ensureListening() {
    if (this.listening) return;
    window.addEventListener("message", this.onMessage);
    window.addEventListener("keydown", this.onKey, true);
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("fullscreenchange", this.onFullscreen);
    this.listening = true;
  }

  attach = (el: HTMLDivElement | null) => {
    this.layer = el;
    if (!el) return;
    for (const e of this.entries.values()) {
      if (!e.box.isConnected) el.appendChild(e.box);
      if (e.pendingSrc) this.load(e, e.pendingSrc);
    }
    this.kick();
  };

  claim(slot: HTMLElement, embed: string): Entry {
    this.ensureListening();
    const id = streamIdentity(embed);
    let e = this.entries.get(id);
    if (e) {
      clearTimeout(e.drop);
      e.drop = undefined;
      e.slot = slot;
      e.placed = "";
      this.setEmbed(e, embed);
    } else {
      const box = document.createElement("div");
      box.className = "lv-stream lv-stream-float";
      const frame = document.createElement("iframe");
      frame.title = "Live stream";
      frame.allow = "autoplay; encrypted-media; fullscreen";
      frame.allowFullscreen = true;
      const host = document.createElement("div");
      host.className = "lv-sc-host";
      box.append(frame, host);
      box.classList.toggle("lv-guard", guarded(embed));
      e = { id, embed, box, frame, host, slot, placed: "", stateAt: Date.now(), volumeSynced: false, handPaused: false, native: false, pseudoFs: false, version: 0, subs: new Set() };
      boxEntries.set(box, e);
      this.entries.set(id, e);
      this.layer?.appendChild(box);
      this.load(e, embed);
    }
    this.kick();
    return e;
  }

  release(e: Entry, slot: HTMLElement) {
    if (e.slot !== slot) return;
    e.slot = null;
    e.box.style.visibility = "hidden";
    e.drop = setTimeout(() => this.remove(e), 300);
  }

  // Same stream, maybe a different mute setting.
  setEmbed(e: Entry, embed: string) {
    if (embed === e.embed) return;
    this.applyEmbed(e, embed);
  }

  private stopConfirm(e: Entry) {
    clearInterval(e.confirm);
    e.confirm = undefined;
  }

  private applyEmbed(e: Entry, embed: string) {
    e.embed = embed;
    const want = embedMuted(embed);
    this.stopConfirm(e);
    const player = playerOf(embed);
    if (!player) {
      this.load(e, embed);
      this.notify(e);
      return;
    }
    let tries = 0;
    const step = () => {
      if (e.muted === want) {
        this.stopConfirm(e);
        if (!want) this.applySavedVolume(e);
        this.notify(e);
        return;
      }
      if (++tries > 8) {
        this.stopConfirm(e);
        this.load(e, e.embed);
        return;
      }
      send(e.frame, player, "listen");
      send(e.frame, player, want ? "mute" : "unmute");
    };
    e.confirm = setInterval(step, 1000);
    step();
    this.notify(e);
  }

  // ----- what the controls do -----

  subscribe(e: Entry, f: () => void): () => void {
    e.subs.add(f);
    return () => e.subs.delete(f);
  }

  private notify(e: Entry) {
    e.version++;
    for (const f of e.subs) f();
  }

  private mutedNow(e: Entry): boolean {
    // while a change is being confirmed, the setting asked for
    return e.confirm || e.muted === undefined ? embedMuted(e.embed) : e.muted;
  }

  view(e: Entry): StreamView {
    return {
      player: playerOf(e.embed),
      muted: this.mutedNow(e),
      volume: e.volume ?? savedVolume() ?? 100,
      state: e.state,
      stateAt: e.stateAt,
      handPaused: e.handPaused,
      playAskedAt: e.playAskedAt,
      error: e.error,
      qualities: e.qualities ?? [],
      quality: e.quality,
      native: e.native,
      fullscreen: document.fullscreenElement === e.box || e.pseudoFs,
      guard: guarded(e.embed),
    };
  }

  // Sound on for one stream turns it off for every other, so two never
  // talk over each other. Kick, with no player API, reloads.
  setMuted(e: Entry, muted: boolean) {
    if (!muted) {
      for (const o of this.entries.values()) if (o !== e && !this.mutedNow(o)) this.applyEmbed(o, withMute(o.embed, true));
      // turned all the way down with the slider: sound back on at half
      if (savedVolume() === 0 || (e.volume ?? 100) < 1) saveVolume(50);
    }
    this.applyEmbed(e, withMute(e.embed, muted));
  }

  // A stream that gets the sound plays at the display's volume (the slider's
  // last level), whichever service it's on.
  private applySavedVolume(e: Entry) {
    const saved = savedVolume();
    if (saved !== undefined && playerOf(e.embed)) this.setVolumeLevel(e, saved);
  }

  private setVolumeLevel(e: Entry, v: number) {
    send(e.frame, playerOf(e.embed), "volume", v);
    e.volume = v;
    e.volumeSetAt = Date.now();
  }

  setVolume(e: Entry, v: number) {
    v = Math.max(0, Math.min(100, Math.round(v)));
    if (!playerOf(e.embed)) return;
    saveVolume(v);
    this.setVolumeLevel(e, v);
    const muted = this.mutedNow(e);
    if (v > 0 && muted) this.setMuted(e, false);
    else if (v === 0 && !muted) this.setMuted(e, true);
    else this.notify(e);
  }

  togglePlay(e: Entry) {
    const player = playerOf(e.embed);
    if (!player) return;
    if (e.state === "playing" || e.state === "buffering") {
      send(e.frame, player, "pause");
      this.stopRevive(e);
      e.handPaused = true;
      e.playAskedAt = undefined;
      e.state = "paused";
      e.stateAt = Date.now();
    } else {
      send(e.frame, player, "play");
      e.handPaused = false;
      e.playAskedAt = Date.now();
    }
    this.notify(e);
  }

  setQuality(e: Entry, group: string) {
    if (playerOf(e.embed) !== "twitch") return;
    send(e.frame, "twitch", "quality", group);
    e.quality = group;
    this.notify(e);
  }

  // The player's own controls, for anything the display's can't do: a
  // service's age or sign-in prompt, YouTube's quality menu, Kick's own play
  // button. Reloads the player with its controls back on, or off again.
  setNative(e: Entry, on: boolean) {
    if (e.native === on) return;
    e.native = on;
    this.load(e, e.embed);
    this.notify(e);
  }

  // The box, not the player, goes fullscreen, so the display's controls go
  // with it. Where a page can't put an element fullscreen (iPhone Safari),
  // the box fills the window instead.
  //
  // On a phone the box always fills the window, and the whole page goes
  // fullscreen behind it where the browser allows (hiding its bars), with
  // the screen turned to landscape where it allows that too. Where the
  // screen stays upright — an iPhone, or rotation not allowed — the CSS
  // lays the box on its side (.lv-pseudo-fs in portrait, live.css), so the
  // picture fills the screen when the phone is turned: upright, a 16:9
  // stream was a band across the middle of a tall black box (2026-11-11).
  // A fullscreen element can't be turned (browsers force transform: none
  // on it), hence the page rather than the box.
  toggleFullscreen(e: Entry) {
    if (document.fullscreenElement === e.box) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (e.pseudoFs) {
      this.setPseudo(e, false);
      return;
    }
    if (window.matchMedia("(pointer: coarse)").matches) {
      this.setPseudo(e, true);
      const landscape = () => {
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        o?.lock?.("landscape").catch(() => undefined);
      };
      if (document.fullscreenElement) landscape();
      else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
        document.documentElement
          .requestFullscreen({ navigationUI: "hide" })
          .then(() => {
            if (!e.pseudoFs) return void document.exitFullscreen().catch(() => undefined);
            this.rootFsFor = e;
            landscape();
          })
          .catch(() => undefined);
      }
      return;
    }
    if (document.fullscreenEnabled && e.box.requestFullscreen) {
      e.box
        .requestFullscreen()
        .then(() => {
          if (window.matchMedia("(pointer: coarse)").matches) {
            const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
            o?.lock?.("landscape").catch(() => undefined);
          }
        })
        .catch(() => this.setPseudo(e, true));
    } else this.setPseudo(e, true);
  }

  private setPseudo(e: Entry, on: boolean) {
    if (e.pseudoFs === on) return;
    e.pseudoFs = on;
    if (!on && this.rootFsFor === e) {
      this.rootFsFor = undefined;
      (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
      if (document.fullscreenElement === document.documentElement) document.exitFullscreen().catch(() => undefined);
    }
    e.box.classList.toggle("lv-pseudo-fs", on);
    this.layer?.classList.toggle("lv-has-pseudo-fs", [...this.entries.values()].some((x) => x.pseudoFs));
    e.placed = "";
    document.dispatchEvent(new Event(STREAM_FULLSCREEN_EVENT));
    this.notify(e);
  }

  // The address is set from code once the frame is in the page, never as a
  // src attribute: on a reload, a browser can put each iframe back on the
  // page it last showed, matched by position in the page rather than by
  // src (a tile once came back playing another game's stream).
  private load(e: Entry, embed: string) {
    this.stopConfirm(e);
    this.stopRevive(e);
    clearInterval(e.listen);
    e.muted = undefined;
    e.paused = undefined;
    e.state = undefined;
    e.stateAt = Date.now();
    e.handPaused = false;
    e.playAskedAt = undefined;
    e.error = undefined;
    e.qualities = undefined;
    e.quality = undefined;
    e.volumeSynced = false;
    e.volumeTries = 0;
    if (!e.box.isConnected) {
      e.pendingSrc = embed;
      return;
    }
    e.pendingSrc = undefined;
    e.frame.src = e.native ? nativeControls(embed) : embed;
    const player = playerOf(embed);
    if (player === "youtube") {
      let n = 0;
      e.listen = setInterval(() => {
        send(e.frame, player, "listen");
        if (++n > 60) clearInterval(e.listen);
      }, 500);
    }
  }

  private remove(e: Entry) {
    this.stopConfirm(e);
    this.stopRevive(e);
    clearInterval(e.listen);
    if (document.fullscreenElement === e.box) document.exitFullscreen().catch(() => undefined);
    this.setPseudo(e, false);
    e.box.remove();
    this.entries.delete(e.id);
  }

  private kick() {
    if (!this.raf && this.entries.size) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    this.raf = 0;
    const fs = document.fullscreenElement;
    for (const e of this.entries.values()) {
      if (!e.slot || e.pseudoFs || fs === e.box) continue;
      // on whole pixels: a guarded player's drawer meeting its frame on a
      // fractional edge overlapped it by one pixel row, which counts as covered
      const s = e.slot.getBoundingClientRect();
      const r = { left: Math.round(s.left), top: Math.round(s.top), width: Math.round(s.right) - Math.round(s.left), height: Math.round(s.bottom) - Math.round(s.top) };
      const dim = Boolean(e.slot.closest(".lifted"));
      const placed = `${r.left},${r.top},${r.width},${r.height},${dim}`;
      if (placed === e.placed) continue;
      e.placed = placed;
      const st = e.box.style;
      st.left = `${r.left}px`;
      st.top = `${r.top}px`;
      st.width = `${r.width}px`;
      st.height = `${r.height}px`;
      st.visibility = r.width > 0 && r.height > 0 ? "visible" : "hidden";
      st.opacity = dim ? "0.35" : "";
    }
    this.kick();
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const e of [...this.entries.values()]) this.remove(e);
    window.removeEventListener("message", this.onMessage);
    window.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("pointermove", this.onPointer);
    document.removeEventListener("fullscreenchange", this.onFullscreen);
    this.listening = false;
  }
}

export const StreamLayerContext = createContext<StreamLayer | null>(null);

// The placeholder: its player is in the StreamLayer, laid over this box,
// with the display's controls rendered into the player's box. `options` are
// the game's other streams for the switcher; `current` is the one playing.
export default function Stream({
  embed,
  options,
  current,
  onPick,
  onUnpin,
}: {
  embed: string;
  options?: StreamOption[];
  current?: string;
  onPick?: (url: string) => void;
  onUnpin?: () => void; // shown in the bar: a guarded tile's own pin button would cover the player
}) {
  const layer = useContext(StreamLayerContext);
  const slot = useRef<HTMLDivElement>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const id = streamIdentity(embed);
  const embedRef = useRef(embed);
  embedRef.current = embed;
  useLayoutEffect(() => {
    const el = slot.current;
    if (!layer || !el) return;
    const e = layer.claim(el, embedRef.current);
    setEntry(e);
    return () => {
      layer.release(e, el);
      setEntry(null);
    };
  }, [layer, id]);
  useLayoutEffect(() => {
    if (layer && entry) layer.setEmbed(entry, embed);
  }, [layer, entry, embed]);
  if (!layer) return <InlineStream embed={embed} />;
  return (
    <>
      <div ref={slot} className="lv-stream lv-stream-slot" />
      {entry && createPortal(<StreamControls layer={layer} entry={entry} options={options ?? []} current={current} onPick={onPick} onUnpin={onUnpin} />, entry.host)}
    </>
  );
}

// Outside the live display: an ordinary frame, with the player's own controls.
function InlineStream({ embed }: { embed: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const src = nativeControls(embed);
  useEffect(() => {
    if (frame.current && frame.current.src !== src) frame.current.src = src;
  }, [src]);
  return (
    <div className="lv-stream">
      <iframe ref={frame} title="Live stream" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
    </div>
  );
}
