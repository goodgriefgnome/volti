// Every key in the kv store, and what it holds: add a key here before storing anything new.
// Renaming one loses what is stored under it.

export const keys = {
  /** Prefs (storage/prefs.ts). */
  prefs: 'prefs',
  /** The linked scores folder's FileSystemDirectoryHandle (originals/originals.ts). */
  folder: 'folder',
  /** The linked folder's PDFs as last read, { path }[], listed while access is locked. */
  folderListing: 'folder-listing',
  /** Files shared into the app, waiting to be imported: File[] (originals/inbox.ts). */
  inbox: 'inbox',

  /*
   * Scores (scores/store.ts), by their original's id. A score and its ink are always written
   * together.
   */
  /** The Score. */
  score: (id: string) => 'score:' + id,
  /** ScoreInk, markings by cut id. */
  ink: (id: string) => 'ink:' + id,
  /** The id of the first cut on the screen you were reading. */
  pos: (id: string) => 'pos:' + id,

  /* Setlists (setlists/store.ts). Cuts and markings are only ever stored in the score. */
  /** Setlist ids, newest first. */
  setlists: 'setlists',
  /** The Setlist. */
  setlist: (id: string) => 'setlist:' + id,
  /** { entry, cut }: the entry, and the first cut on the screen, you were reading. */
  setlistPos: (id: string) => 'pos:set:' + id,
};
