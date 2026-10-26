// Setlists and their entries, as the rest of the app uses them: changing them, keeping them on the
// same music, and storing them. Other directories import setlists/ only from here.

export { addEntries, defaultSetlist, duplicate, followScore, moveEntry, moveExcerpt, newSetlist, setEntrySpan, setlistsWith, withSetlist, type Entry, type Setlist } from './model';
export { deleteSetlist, loadLastAddedTo, loadSetlists, saveChanged, saveLastAddedTo } from './store';
