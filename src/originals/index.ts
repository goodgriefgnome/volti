// Originals, as the rest of the app uses them: the library's root (the linked folder, or the app's
// own), adding files to it, listing them, an original (read as a PDF, moved, removed), Recently
// removed, passwords, and opening their pages. Other directories import originals/ only from here.

export { byFolder, subfolders } from './by-folder';
export { dropLeftInApp, leftInApp, previewIncoming, putIncoming, readIncoming, type Incoming, type LeftInApp } from './adding';
export { arrivals, type Arrival } from './arrivals';
export { appRootBytes, canLinkFolder, exportExists, EXPORTS, folderState, linkFolder, NoAccess, saveExport, unlinkFolder, unlockFolder, type FolderState } from './folder';
export { dropInbox, peekInbox, putInbox } from './inbox';
export { lockedOriginals } from './locks';
export { fileNameProblem, folderOf, pathInFolder, pathWithTitle, titleOf } from './names';
export { openOriginal, PasswordNotGiven, type AskPassword } from './open';
export type { Original } from './original';
export { allOriginals, byTitle, knownTitles } from './originals';
export { PageCache, type PagePictures } from './pages';
export { forgetRemoved, purgeRemoved, recentlyRemoved, removedBytes, removedFile, restoreRemoved, type Removed } from './removed';
