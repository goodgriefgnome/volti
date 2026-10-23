// Every key in the kv store, and what it holds: add a key here before storing anything new.
// Renaming one loses what is stored under it.

export const keys = {
  /** Prefs (storage/prefs.ts). */
  prefs: 'prefs',
  /** The linked scores folder's FileSystemDirectoryHandle (originals/originals.ts). */
  folder: 'folder',
  /** The linked folder's PDFs as last read, { path, id }[], listed while access is locked. */
  folderListing: 'folder-files',
  /**
   * Each original's SHA-256 as last worked out, with the size and modified time it was worked out
   * for, by "folder/" + path or "imported/" + name.
   */
  hashes: 'hashes',
  /** Each original's title as last seen, by id: for scores whose original is missing. */
  titles: 'titles',
  /** Files shared into the app, waiting to be imported: File[] (originals/inbox.ts). */
  inbox: 'inbox',

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
  /** Aspects, the original's page shapes as last opened: for laying out pages without opening it. */
  aspects: (id: string) => 'aspects:' + id,

  /* Setlists (setlists/store.ts). Cuts and markings are only ever stored in the score. */
  /** Setlist ids, newest first. */
  setlists: 'setlists',
  /** The Setlist. */
  setlist: (id: string) => 'setlist:' + id,
  /** { entry, cut }: the entry, and the first cut on the screen, you were reading. */
  setlistPos: (id: string) => 'pos:set:' + id,
  /** The id of the setlist a score was last added to, which scores are added to by default. */
  lastAddedTo: 'last-added-to',
};
