// Bringing the stored data up to the app's version at start-up: the version kept in the kv store,
// and the steps from each version to the next. A change to what is stored adds a step here and
// raises DATA_VERSION.

import { folderToVersion3 } from './originals/device-score-fs';
import { scoresToVersion2, scoresToVersion3 } from './scores/store';
import { keys } from './storage/keys';
import { kv } from './storage/kv';

/** The version of the stored data this app reads and writes. */
export const DATA_VERSION = 3;

/** A step brings the whole store from one version to the next. Run again after failing partway, it finishes what is left. */
export type Step = () => Promise<void>;

/** Each step, by the version it starts from. */
const STEPS: Record<number, Step> = { 1: scoresToVersion2, 2: toVersion3 };

/** The keys earlier versions wrote that are not in the format of STORAGE.md; what they held is not carried over. */
const OLD_KEYS = ['folder-files', 'hashes', 'internal-ids', 'titles', 'removed', 'inbox'];
const OLD_PREFIXES = ['pos:', 'aspects:', 'password:'];

/**
 * The step from version 2 to 3: what earlier versions left goes. The database `volti` from before
 * scores and the keys of OLD_KEYS and OLD_PREFIXES are deleted, scores lose the fields of earlier
 * versions, and a bare handle under `folder` becomes a FolderLink.
 */
async function toVersion3(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('volti');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  const old = (await Promise.all(OLD_PREFIXES.map((p) => kv.entries(p)))).flat().map(([key]) => key);
  await Promise.all([...OLD_KEYS, ...old].map((key) => kv.del(key)));
  await scoresToVersion3();
  await folderToVersion3();
}

/** Where the version is kept: the kv store, or a stand-in in tests. */
export interface VersionStore { get(): Promise<number | undefined>; set(version: number): Promise<void> }

/** The kv store's version; none stored is version 1. */
const kvVersion: VersionStore = {
  get: async () => (await kv.get<number>(keys.dataVersion)) ?? 1,
  set: (version) => kv.set(keys.dataVersion, version),
};

/**
 * Run each step from the stored version up to `target`, in order, raising the stored version after
 * each; `starting` is called once, before the first step, when there is one. 'newer' when the
 * stored version is above `target`: nothing runs. A step's error is thrown on, after the versions
 * of the steps before it are stored.
 */
export async function _upgrade(store: VersionStore, steps: Record<number, Step>, target: number, starting: () => void): Promise<'done' | 'newer'> {
  let version = (await store.get()) ?? 1;
  if (version > target) return 'newer';
  if (version < target) starting();
  for (; version < target; version++) {
    const step = steps[version];
    if (!step) throw new Error(`No step from version ${version} of the stored data`);
    await step();
    await store.set(version + 1);
  }
  return 'done';
}

/** _upgrade on the kv store, with STEPS, to DATA_VERSION. */
export const upgradeStoredData = (starting: () => void) => _upgrade(kvVersion, STEPS, DATA_VERSION, starting);
