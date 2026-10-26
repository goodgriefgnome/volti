// What is on a screen, as the screens and exporting use it: fitting frames to it, zoom maths,
// drawing a frame. Other directories import render/ only from here.

export { framesOnScreen } from './layout';
export { cutTarget, drawFrame, drawFrameInk, frameTarget, regionBands, shownOn, type Hatches } from './paint';
export { pageWidths, placeScreen, readPageWidths, screenAt, type ScreenBox } from './screen';
export { isZoomed, NO_ZOOM, pan, pinch, scrollForPinch, visiblePart, type Pt, type Zoom } from './zoom';
