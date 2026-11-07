// Every key in the kv store, what it holds, and the module that reads and writes it: add a key here
// before storing anything new. Renaming one loses what is stored under it. Only the modules named
// here use the kv store: the */store.ts files, originals/, and stored-data.ts.

export const keys = {
  /** An OriginalRecord, by the original's id: where its bytes are, and what reading it found (originals/_record-store.ts; STORAGE.md). */
  original: (id: string) => 'original:' + id,
  /** The linked scores folder, on the device or in Google Drive: a FolderLink, kept after unlinking to tell a folder linked later is the same (originals/_folder-link.ts). */
  folder: 'folder',
  /** The Google Drive sign-in: { refreshToken }, deleted when Google refuses it or Volti signs out (originals/_drive-auth.ts). */
  driveAuth: 'drive-auth',
  /** The library's subfolder lists closed by hand, by path (library/_store.ts). */
  closedFolders: 'closed-folders',
  /** What was last read and where in it: the score, excerpt or setlist, and the first cut on the screen (reader/_store.ts). */
  lastRead: 'last-read',
  /** The version of the stored data, a number; none is version 1 (src/stored-data.ts). */
  dataVersion: 'data-version',

  /*
   * Scores (scores/store.ts), by their original's id (the SHA-256 of its contents). A score and its ink are always written
   * together.
   */
  /** The Score. */
  score: (id: string) => 'score:' + id,
  /** ScoreInk: markings by original page. */
  ink: (id: string) => 'ink:' + id,

  /** A glyph's outline as path data, by `<font id>:<glyph index>` (markings/store.ts). */
  glyph: (key: string) => 'glyph:' + key,

  /** The SymbolLibrary: the user's symbols in groups, one for the app (markings/store.ts). */
  symbols: 'symbols',

  /** The default colours of placed markings and their backgrounds, { color?, background? } (markings/store.ts). */
  markColors: 'placed-mark-colors',

  /** Each tool's settings for new markings, a ToolSettings (markings/store.ts). */
  toolSettings: 'tool-settings',

  /** The face gestures' settings, a FaceSettings (face/store.ts). */
  faceGestures: 'face-gestures',

  /* Setlists (setlists/store.ts). Cuts and markings are only ever stored in the score. */
  /** Setlist ids, newest first. */
  setlists: 'setlists',
  /** The Setlist. */
  setlist: (id: string) => 'setlist:' + id,
  /** The id of the setlist a score was last added to, which scores are added to by default. */
  lastAddedTo: 'last-added-to',
};
