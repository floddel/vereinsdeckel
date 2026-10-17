/**
 * Kurzer Hinweiston („Ding-Dong“), im Browser erzeugt – keine Tondatei, keine externe Quelle.
 * Browser spielen Töne erst nach einer Berührung ab: `unlockDing` beim ersten Tippen aufrufen.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx ??= new AudioContext();
  return ctx;
}

export function unlockDing() {
  try {
    void context()?.resume();
  } catch {}
}

export function playDing() {
  try {
    const c = context();
    if (!c || c.state !== "running") return;
    const tone = (freq: number, start: number) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, c.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.4, c.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + 0.5);
      osc.connect(gain).connect(c.destination);
      osc.start(c.currentTime + start);
      osc.stop(c.currentTime + start + 0.55);
    };
    tone(1046.5, 0); // C6
    tone(784, 0.22); // G5
  } catch {}
}
