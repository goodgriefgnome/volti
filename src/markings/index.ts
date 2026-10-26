// What can be drawn on the music, and how, as the rest of the app uses it: the markings, pen and
// highlighter strokes, and drawing them. Other directories import markings/ only from here.

export { canvasDrawing, type Drawing, type Look } from './draw';
export { anchorOf, annotationOf, copyMarking, drawMarkings, hits, mapMarking, shareOf, type DrawTarget, type Marking, type Point } from './model';
export { compact, drawPenSegment, HIGHLIGHT_COLOR, HIGHLIGHT_SIZE, PEN_COLORS, PEN_SIZE, type Stroke } from './stroke';
