// The zoom of the reader's screen: where it is, the smallest it may be, the view below the
// toolbar it is moved within, and placing a new screen. The moves themselves are render/zoom.ts.

import { fitScale, isIdentity, NO_ZOOM, placeFresh, type View, type Zoom } from '../render/zoom';

export interface StageZoomHost {
  stage: HTMLElement;
  /** The element the zoom transforms. */
  screen: HTMLElement;
  /** The toolbar shows: annotation mode. */
  annotating(): boolean;
  /** The toolbar's height in CSS pixels. */
  barHeight(): number;
  /** The zoom changed: the tools' chrome, the toolbar's state and the close-up follow. */
  changed(): void;
}

export class StageZoom {
  private z: Zoom = NO_ZOOM;
  private min = 1;

  constructor(private host: StageZoomHost) {}

  get zoom(): Zoom { return this.z; }

  /** The smallest zoom: the screen fits below the toolbar at its tallest since it showed. */
  get minScale(): number { return this.min; }

  /** The part of the stage below the toolbar, which the screen is moved within. */
  view(): View {
    return { top: this.host.annotating() ? this.host.barHeight() : 0, W: this.host.stage.clientWidth, H: this.host.stage.clientHeight };
  }

  set(z: Zoom): void {
    this.z = z;
    this.host.screen.style.transform = !isIdentity(z) ? `translate(${z.x}px, ${z.y}px) scale(${z.s})` : '';
    this.host.changed();
  }

  /** A new screen: whole below the toolbar and centred while it shows, at full size otherwise. */
  placeFresh(): void {
    this.set(this.host.annotating() ? placeFresh(this.view()) : NO_ZOOM);
  }

  /** The toolbar hid: the smallest zoom is 1 again, and the screen at full size. */
  reset(): void {
    this.min = 1;
    this.set(NO_ZOOM);
  }

  /** The toolbar showed or changed: the smallest zoom lowers to fit below it, never rises. */
  barChanged(): void {
    if (this.host.annotating()) this.min = Math.min(this.min, fitScale(this.view()));
  }
}
