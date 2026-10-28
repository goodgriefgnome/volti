// Every key in the kv store, what it holds, and the module that reads and writes it: add a key here
// before storing anything new. Renaming one loses what is stored under it. Only the modules named
// here use the kv store: the */store.ts files, and originals/.

export const keys = {
  /** An OriginalRecord, by the original's id: where its bytes are, and what reading it found (originals/_record-store.ts; STORAGE.md). */
  original: (id: string) => 'original:' + id,
  /** The linked scores folder's FileSystemDirectoryHandle (originals/device-score-fs.ts). */
  folder: 'folder',
  /** The linked folder's PDFs as last read, { path, id }[], listed while access is locked (originals/device-score-fs.ts). */
  folderListing: 'folder-files',
  /**
   * Each file's SHA-256 in the linked folder as last worked out, with the size and modified time it
   * was worked out for, by its path there (originals/device-score-fs.ts).
   */
  hashes: 'hashes',
  /** Each file's SHA-256 in Volti's own folder, exactly, by its path there (originals/internal-score-fs.ts). */
  internalIds: 'internal-ids',
  /** Each original's title as last seen, by id: for scores whose original is missing (originals/library-files.ts). */
  titles: 'titles',
  /**
   * Files removed from the library in the last week, kept in OPFS: { key, id, path, at } by the
   * key each is kept under (originals/trash-fs.ts).
   */
  removed: 'removed',
  /** The library's subfolder lists closed by hand, by path (library/store.ts). */
  closedFolders: 'closed-folders',
  /** Files shared into the app, waiting to be added to the library: File[] (originals/inbox-fs.ts). */
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
  /** Aspects, the original's page shapes (originals/original.ts): for laying out pages without opening it. */
  aspects: (id: string) => 'aspects:' + id,
  /** The password that opened a PDF protected by one, by its file's id (originals/pdf-source.ts). */
  password: (id: string) => 'password:' + id,

  /* Setlists (setlists/store.ts). Cuts and markings are only ever stored in the score. */
  /** Setlist ids, newest first. */
  setlists: 'setlists',
  /** The Setlist. */
  setlist: (id: string) => 'setlist:' + id,
  /** The id of the setlist a score was last added to, which scores are added to by default. */
  lastAddedTo: 'last-added-to',
};
