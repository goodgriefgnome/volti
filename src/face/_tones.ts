// The tones a recording plays: a tone at a time, and when it will be heard, on the performance
// clock the frames' times are on. The only place face/ makes sound.

let audio: AudioContext | undefined;
/** Tones scheduled and not yet over, so stopping can silence them. */
const playing = new Set<OscillatorNode>();

/** Make sure sound can play (call from a tap). */
export function readyTones(): void {
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
}

/** Play a tone of `freq` Hz for `ms`, `at` ms from now; gives when it will be heard, on the performance clock (ms). */
export function tone(freq: number, at: number, ms: number): number {
  readyTones();
  const c = audio!;
  const o = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime + Math.max(0, at) / 1000;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.01);
  g.gain.setValueAtTime(0.5, t0 + ms / 1000 - 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + ms / 1000 + 0.01);
  playing.add(o);
  o.addEventListener('ended', () => playing.delete(o));
  return performance.now() + Math.max(0, at) + (c.outputLatency || c.baseLatency || 0) * 1000;
}

/** Silence every tone scheduled and not yet over. */
export function stopTones(): void {
  for (const o of playing) {
    try { o.stop(); } catch { /* already over */ }
  }
  playing.clear();
}
