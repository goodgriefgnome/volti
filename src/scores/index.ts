// Scores, as the rest of the app uses them: their data, edits, frames, which cut owns a marking,
// and storing them. Other directories import scores/ only from here.

export { cutAt, deleteArchived, edgeKind, edgeRange, insertArchived, insertPages, joinNext, release, remove, restoreEdge, setEdge, setInk, setPad, tidy, type InsertAt } from './edits';
export { cutLetter, frameOf, freeze, isLandscape, pack, placeLabel, places, roomBefore, type Frame, type Place, type Placed } from './frames';
export { A4, type Aspects, type Cut, type ExcerptName, type Score, type ScoreInk, type State } from './model';
export { claimMarking, visible } from './ownership';
export { loadAspects, loadSavedScore, loadScore, saveScore, saveScorePosition, scoreEntries, scoreEntry } from './store';
