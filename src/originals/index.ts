// Source files and originals, as the rest of the app uses them: the library's root (the linked
// folder, or the app's own), files coming into it, listing them, a source file (moved, removed,
// read), the original reading one gives (its pages, its PDF), Recently removed, and passwords.
// Other directories import originals/ only from here.

export { byFolder, subfolders } from './by-folder';
export { leftInApp, putIncoming, readIncoming } from './adding';
export { arrivals, type Arrival } from './arrivals';
export { appRootBytes, canLinkFolder, exportExists, EXPORTS, folderState, linkFolder, NoAccess, saveExport, unlinkFolder, unlockFolder, type FolderState } from './folder';
export { dropInbox, peekInbox, putInbox } from './inbox';
export { fileNameProblem, folderOf, pathInFolder, pathWithTitle, titleOf } from './names';
export { PasswordNotGiven, type AskPassword } from './open';
export type { Original, SourceFile } from './original';
export { byTitle, knownTitles, libraryFiles } from './originals';
export { PageCache, type PagePictures } from './pages';
export { forgetRemoved, purgeRemoved, recentlyRemoved, removedBytes, removedFile, restoreRemoved, type Removed } from './removed';
