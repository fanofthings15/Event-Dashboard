let sharedContext: AudioContext | null = null;

export function playNotificationPing(): void {
  try {
    // Browsers require a user gesture before audio can play — by the time
    // someone's gotten to enabling notifications they've already clicked
    // something, so this should be unlocked already. If it isn't, this
    // just silently no-ops rather than throwing.
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!sharedContext) sharedContext = new AudioContextCtor();

    const ctx = sharedContext;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880; // A5 — a clean, unobtrusive ping
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
  } catch {
    // Audio playback isn't critical — the browser notification itself is
    // the real signal, this is just a nice-to-have on top of it.
  }
}
