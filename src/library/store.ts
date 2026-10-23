// What the library remembers of how it was shown, in the kv store: the subfolder lists closed by
// hand. The only place the library touches storage.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';

export const loadClosedFolders = async () => (await kv.get<string[]>(keys.closedFolders)) ?? [];
export const saveClosedFolders = (paths: string[]) => kv.set(keys.closedFolders, paths);
