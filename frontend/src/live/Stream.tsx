import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { toEmbedUrl } from "../streamEmbed";

// The first link that can actually be framed — a YouTube channel's /live
// tab has no video id to embed, so it's skipped in favour of whatever comes
// next (Kick, then Twitch, in the backend's ranking).
// Muted unless asked otherwise: browsers block unmuted autoplay, and only
// the multi-game display's big spot plays with sound.
export function embeddableStream(urls: string[], muted = true): { embed: string; source: string } | null {
  for (const url of urls) {
    const embed = toEmbedUrl(url, { muted });
    if (/^https:\/\/(www\.)?youtube\.com\/embed\//.test(embed)) return { embed, source: "YouTube" };
    if (embed.startsWith("https://player.kick.com/")) return { embed, source: "Kick" };
    if (embed.startsWith("https://player.twitch.tv/")) return { embed, source: "Twitch" };
  }
  return null;
}

// The stream a frame is on, leaving out its mute setting: a tile gaining or
// losing the sound is the same stream.
function streamIdentity(embed: string): string {
  try {
    const u = new URL(embed);
    u.searchParams.delete("mute");
    u.searchParams.delete("muted");
    return u.toString();
  } catch {
    return embed;
  }
}

const embedMuted = (embed: string) => /[?&]mute(d)?=(1|true)(&|$)/.test(embed);

type Player = "youtube" | "twitch" | null;
const playerOf = (embed: string): Player =>
  /^https:\/\/(www\.)?youtube\.com\/embed\//.test(embed) ? "youtube" : embed.startsWith("https://player.twitch.tv/") ? "twitch" : null;

// Messages to a player that's already playing. YouTube: the IFrame API's
// postMessage protocol (the embed has enablejsapi=1); "listening" asks it to
// report its state back. Twitch: the message Twitch's own embed script
// (embed.twitch.tv/embed/v1.js) sends the player.twitch.tv frame — SetMuted
// is command 10 there; the player reports its state on its own.
// Both checked in headless Chrome 2026-11-03: each reports muted true/false
// after the command. Kick has no player API.
function send(frame: HTMLIFrameElement, player: Player, msg: "listen" | "mute" | "unmute") {
  const win = frame.contentWindow;
  if (!win) return;
  if (player === "youtube") {
    const body = msg === "listen" ? { event: "listening", id: 1, channel: "widget" } : { event: "command", func: msg === "mute" ? "mute" : "unMute", args: [], id: 1, channel: "widget" };
    win.postMessage(JSON.stringify(body), "https://www.youtube.com");
  } else if (player === "twitch" && msg !== "listen") {
    win.postMessage({ eventName: 10, params: msg === "mute", namespace: "twitch-embed-player-proxy" }, "https://player.twitch.tv");
  }
}

// The muted state a player reports, from one of its messages.
function reportedMuted(data: unknown): boolean | undefined {
  try {
    const d = typeof data === "string" ? JSON.parse(data) : data;
    if (d?.info && typeof d.info === "object" && typeof d.info.muted === "boolean") return d.info.muted; // YouTube
    if (d?.namespace === "twitch-embed-player-proxy" && typeof d.params?.muted === "boolean") return d.params.muted; // Twitch
  } catch {
    // not a player message
  }
  return undefined;
}

interface Entry {
  id: string;
  embed: string; // the address as last asked for, including its mute setting
  box: HTMLDivElement;
  frame: HTMLIFrameElement;
  slot: HTMLElement | null;
  pendingSrc?: string;
  drop?: ReturnType<typeof setTimeout>;
  confirm?: ReturnType<typeof setInterval>;
  listen?: ReturnType<typeof setInterval>;
  muted?: boolean; // as the player last reported it
  placed: string;
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
export class StreamLayer {
  private entries = new Map<string, Entry>();
  private layer: HTMLDivElement | null = null;
  private raf = 0;
  private listening = false;

  private onMessage = (ev: MessageEvent) => {
    for (const e of this.entries.values()) {
      if (e.frame.contentWindow !== ev.source) continue;
      const m = reportedMuted(ev.data);
      if (m !== undefined) {
        e.muted = m;
        if (e.listen) {
          clearInterval(e.listen);
          e.listen = undefined;
        }
      }
      return;
    }
  };

  private ensureListening() {
    if (this.listening) return;
    window.addEventListener("message", this.onMessage);
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
      box.appendChild(frame);
      e = { id, embed, box, frame, slot, placed: "" };
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
    e.embed = embed;
    const want = embedMuted(embed);
    clearInterval(e.confirm);
    const player = playerOf(embed);
    if (!player) return this.load(e, embed);
    let tries = 0;
    const step = () => {
      if (e.muted === want) {
        clearInterval(e.confirm);
        return;
      }
      if (++tries > 8) {
        clearInterval(e.confirm);
        this.load(e, e.embed);
        return;
      }
      send(e.frame, player, "listen");
      send(e.frame, player, want ? "mute" : "unmute");
    };
    step();
    e.confirm = setInterval(step, 1000);
  }

  // The address is set from code once the frame is in the page, never as a
  // src attribute: on a reload, a browser can put each iframe back on the
  // page it last showed, matched by position in the page rather than by
  // src (a tile once came back playing another game's stream).
  private load(e: Entry, embed: string) {
    clearInterval(e.confirm);
    clearInterval(e.listen);
    e.muted = undefined;
    if (!e.box.isConnected) {
      e.pendingSrc = embed;
      return;
    }
    e.pendingSrc = undefined;
    e.frame.src = embed;
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
    clearInterval(e.confirm);
    clearInterval(e.listen);
    e.box.remove();
    this.entries.delete(e.id);
  }

  private kick() {
    if (!this.raf && this.entries.size) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    this.raf = 0;
    for (const e of this.entries.values()) {
      if (!e.slot) continue;
      const r = e.slot.getBoundingClientRect();
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
    this.listening = false;
  }
}

export const StreamLayerContext = createContext<StreamLayer | null>(null);

// The placeholder: its player is in the StreamLayer, laid over this box.
export default function Stream({ embed }: { embed: string }) {
  const layer = useContext(StreamLayerContext);
  const slot = useRef<HTMLDivElement>(null);
  const entry = useRef<Entry | null>(null);
  const id = streamIdentity(embed);
  const embedRef = useRef(embed);
  embedRef.current = embed;
  useLayoutEffect(() => {
    const el = slot.current;
    if (!layer || !el) return;
    const e = layer.claim(el, embedRef.current);
    entry.current = e;
    return () => {
      layer.release(e, el);
      entry.current = null;
    };
  }, [layer, id]);
  useLayoutEffect(() => {
    if (layer && entry.current) layer.setEmbed(entry.current, embed);
  }, [layer, embed]);
  if (!layer) return <InlineStream embed={embed} />;
  return <div ref={slot} className="lv-stream lv-stream-slot" />;
}

// Outside the live display: an ordinary frame.
function InlineStream({ embed }: { embed: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (frame.current && frame.current.src !== embed) frame.current.src = embed;
  }, [embed]);
  return (
    <div className="lv-stream">
      <iframe ref={frame} title="Live stream" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
    </div>
  );
}
