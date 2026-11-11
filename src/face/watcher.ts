// Watching the front camera: starting and stopping it, the detection loop at 15 frames a second,
// and telling its owner (the reader, or the settings dialog) what is seen. The rules of what turns
// a page are _detector.ts's.

import { detect, landmarker } from './_landmarker';
import { NEW_DETECTOR, step, type DetectorState, type Progress } from './_detector';
import { hasGestures, type Active, type FaceFrame, type TurnDir } from './gestures';
import { loadFaceSettings } from './store';
import { channelsOf } from './template';

export type CameraStatus = 'stopped' | 'starting' | 'running' | 'paused';

export interface WatcherEvents {
  /** The camera's status changed. */
  status(s: CameraStatus): void;
  /** Whether a face is seen: false after a second without one, true again on the next face. */
  face(seen: boolean): void;
  /** Each frame, for meters and recording, with its channels (null without a face) and its time (ms, the animation frame's). */
  frame(f: FaceFrame | null, x: Float32Array | null, now: number): void;
  /** Each frame: how close each direction is. */
  progress(p: Record<TurnDir, Progress>): void;
  /** A gesture turned. */
  turn(dir: TurnDir): void;
  /** The camera or the model couldn't start, or the camera ended: stopped. */
  failed(e: unknown): void;
}

/** How often at most a frame is read, and how long without a face before it is said to be gone. */
const FRAME_MS = 1000 / 15;
const NO_FACE_MS = 1000;

export class FaceWatcher {
  /** The video element, for a preview (the dialog shows it; the reader doesn't). */
  readonly video = document.createElement('video');
  private status: CameraStatus = 'stopped';
  private stream?: MediaStream;
  /** Changes at every start and stop, so what a start left waiting knows it is out of date. */
  private run = 0;
  private detector: DetectorState = NEW_DETECTOR;
  private faceSeen = false;
  private lastFaceAt = 0;
  private lastTick = 0;
  private lastVideoTime = -1;

  constructor(private events: Partial<WatcherEvents>, private gestures: Active[]) {
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
  }

  /** Start the front camera and detection (status starting, then running). */
  async start(): Promise<void> {
    if (this.status !== 'stopped') return;
    const run = ++this.run;
    this.setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (run !== this.run) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      track.addEventListener('mute', () => this.setPaused(run, true));
      track.addEventListener('unmute', () => this.setPaused(run, false));
      track.addEventListener('ended', () => {
        if (run !== this.run) return;
        this.stop();
        this.events.failed?.(new Error('The camera was turned off.'));
      });
      this.video.srcObject = stream;
      await this.video.play();
      const l = await landmarker();
      if (run !== this.run) return;
      this.detector = NEW_DETECTOR;
      this.setFace(false);
      this.lastFaceAt = 0;
      this.lastTick = 0;
      this.lastVideoTime = -1;
      // A track muted before it was listened to starts paused.
      this.setStatus(track.muted ? 'paused' : 'running');
      const tick = (now: number) => {
        if (run !== this.run) return;
        requestAnimationFrame(tick);
        this.tick(l, now);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      if (run !== this.run) return;
      this.stop();
      this.events.failed?.(e);
    }
  }

  /** Stop the camera and detection (status stopped). Safe to call when stopped. */
  stop(): void {
    this.run++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.video.srcObject = null;
    this.setFace(false);
    this.setStatus('stopped');
  }

  /** New gestures that can turn: the detector starts afresh with them. */
  setGestures(gestures: Active[]): void {
    this.gestures = gestures;
    this.detector = NEW_DETECTOR;
  }

  private setStatus(s: CameraStatus) {
    if (s === this.status) return;
    this.status = s;
    this.events.status?.(s);
  }

  private setFace(seen: boolean) {
    if (seen === this.faceSeen) return;
    this.faceSeen = seen;
    this.events.face?.(seen);
  }

  private setPaused(run: number, paused: boolean) {
    if (run !== this.run || this.status === 'starting' || this.status === 'stopped') return;
    this.detector = NEW_DETECTOR;
    this.setStatus(paused ? 'paused' : 'running');
  }

  /** One animation frame: read the video's new frame, if it is time, and tell what it shows. */
  private tick(l: Parameters<typeof detect>[0], now: number) {
    if (this.faceSeen && now - this.lastFaceAt >= NO_FACE_MS) this.setFace(false);
    if (this.status !== 'running') return;
    if (now - this.lastTick < FRAME_MS - 2) return;
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    this.lastTick = now;
    const f = detect(l, v, now);
    if (f) {
      this.lastFaceAt = now;
      this.setFace(true);
    }
    const x = f ? channelsOf(f.scores) : null;
    const r = step(this.detector, x, this.gestures, now);
    this.detector = r.state;
    this.events.frame?.(f, x, now);
    this.events.progress?.(r.progress);
    if (r.turn) this.events.turn?.(r.turn);
  }
}

/** Load MediaPipe and the model in the background, if any gesture is set; failures are dropped (starting tries again). */
export async function warmUp(): Promise<void> {
  try {
    if (hasGestures(await loadFaceSettings())) await landmarker();
  } catch {
    // Starting the camera tries again, and says why if it fails.
  }
}
