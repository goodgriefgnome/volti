// Source files and originals, as the rest of the app uses them. Other directories import originals/
// only from here; everything else in the directory is private to it.

// Types and errors.
export { NoAccess, PasswordNotGiven, type AskPassword, type FolderState, type Original, type PagePictures, type Removed, type RenderedPdf, type SourceFile } from './types';
export { PageCache } from './original';

// The device folder.
export { canLinkFolder, EXPORTS, exportExists, folderState, linkFolder, saveExport, unlinkFolder, unlockFolder } from './device-score-fs';

// The library.
export { internalBytes } from './internal-score-fs';
export { knownTitles, libraryFiles } from './library-files';

// Files coming in.
export { leftInApp, readIncoming, removedSource } from './misc-files';
export { dropInbox, peekInbox, putInbox } from './inbox-fs';

// Trash.
export { purgeRemoved, recentlyRemoved, removedBytes } from './trash-fs';

// Paths.
export { arrivals, byFolder, byTitle, fileNameProblem, folderOf, pathInFolder, pathWithTitle, subfolders, titleOf, type Arrival } from './path-utils';
