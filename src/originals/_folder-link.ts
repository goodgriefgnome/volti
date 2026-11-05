// The kv key `folder`: the linked folder, on the device or in Google Drive, kept after unlinking
// to tell whether one linked later is the same. Read and written only through here.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';

/** What is stored under `folder`: the linked folder, kept after unlinking to tell whether one linked later is the same. */
export type FolderLink =
  | { kind: 'device'; handle: FileSystemDirectoryHandle; linked: boolean }
  | { kind: 'drive'; folderId: string; name: string; linked: boolean };

export const _storedLink = (): Promise<FolderLink | undefined> => kv.get<FolderLink>(keys.folder);
export const _storeLink = (link: FolderLink): Promise<void> => kv.set(keys.folder, link);
/** Whether a folder is linked, read afresh from storage: for the service worker, which has no state. */
export const _isLinked = async () => (await _storedLink())?.linked === true;
