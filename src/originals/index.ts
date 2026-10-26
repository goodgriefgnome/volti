// Originals, as the rest of the app uses them: the linked folder, added scores, listing them, an
// original (read as a PDF, moved, removed), passwords, and opening their pages. Other directories
// import originals/ only from here.

export { byFolder, subfolders } from './by-folder';
export { canLinkFolder, exportExists, EXPORTS, folderState, linkFolder, NoAccess, saveExport, unlinkFolder, unlockFolder, type FolderState } from './folder';
export { importedBytes, importFiles, importShared } from './imported';
export { putInbox } from './inbox';
export { lockedOriginals } from './locks';
export { fileNameProblem, folderOf, pathInFolder, pathWithTitle, titleOf } from './names';
export { openOriginal, PasswordNotGiven, type AskPassword } from './open';
export type { Original } from './original';
export { allOriginals, byTitle, knownTitles } from './originals';
export { PageCache, type PagePictures } from './pages';
