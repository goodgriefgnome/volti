// Every key in the kv store, and what it holds: add a key here before storing anything new.
// Renaming one loses what is stored under it.

export const keys = {
  /** Prefs (storage/prefs.ts). */
  prefs: 'prefs',
  /** The linked scores folder's FileSystemDirectoryHandle (sources/scores.ts). */
  folder: 'folder',
  /** The linked folder's PDFs as last read, { path }[], listed while access is locked. */
  folderListing: 'folder-listing',
  /** Files shared into the app, waiting to be imported: File[] (sources/inbox.ts). */
  inbox: 'inbox',

  /*
   * One piece per score for now, so the piece id is the score id (pieces/store.ts).
   * The piece and its ink are always written together, so a piece record means the ink is by cut.
   */
  /** The Piece. */
  piece: (id: string) => 'piece:' + id,
  /** PieceInk, markings by cut id. Before pieces: ScoreInk, strokes by page number. */
  ink: (id: string) => 'ink:' + id,
  /** The id of the first cut on the screen you were reading. */
  pos: (id: string) => 'pos:' + id,
  /** Before pieces: the 1-based page you were reading. Only read, to migrate it. */
  oldPage: (id: string) => 'page:' + id,

  /* Setlists (setlists/store.ts). Cuts and markings are only ever stored in the piece. */
  /** Setlist ids, newest first. */
  setlists: 'setlists',
  /** The Setlist. */
  setlist: (id: string) => 'setlist:' + id,
  /** { entry, cut }: the entry, and the first cut on the screen, you were reading. */
  setlistPos: (id: string) => 'pos:set:' + id,
};
