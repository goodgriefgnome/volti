// Every key in the kv store, what it holds, and the module that reads and writes it: add a key here
// before storing anything new. Renaming one loses what is stored under it. Only the modules named
// here use the kv store: the */store.ts files, and originals/.

export const keys = {
  /** An OriginalRecord, by the original's id: where its bytes are, and what reading it found (originals/_record-store.ts; STORAGE.md). */
  original: (id: string) => 'original:' + id,
  /** The linked scores folder: { handle, linked }, kept after unlinking to tell a folder linked later is the same (originals/device-score-fs.ts). */
  folder: 'folder',
  /** The library's subfolder lists closed by hand, by path (library/store.ts). */
  closedFolders: 'closed-folders',

  /*
   * Scores (scores/store.ts), by their original's id (the SHA-256 of its contents). A score and its ink are always written
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
  /** The id of the setlist a score was last added to, which scores are added to by default. */
  lastAddedTo: 'last-added-to',
};
