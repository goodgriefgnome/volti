// The inbox: files shared into the app, held by the service worker until the page adds them to the
// library (misc-files.ts). Each is kept in OPFS inbox/ under its id, with a record saying so. Both
// the page and the service worker use it, so no DOM and no pdf.js.

import { hashBytes, writeFile } from './_filesystem-utils';
import { _isLinked } from './device-score-fs';
import { _bytesName, _rank, type Where } from './_record-model';
import { _updateRecord } from './_record-store';
import { _importName } from './path-utils';

const dir = async (name: 'inbox' | 'removed') => (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });

/**
 * For the service worker: take files shared to Volti. Each is read once and hashed. One whose id
 * has a better place than the inbox is dropped. Otherwise its bytes are written to inbox/<id>
 * first, then its record becomes inbox, at the name it would go at, keeping its aspects and
 * password, and a removed copy's bytes are deleted after. Two files with the same id in one share
 * are one.
 */
export async function putInbox(files: File[]): Promise<void> {
  const linked = await _isLinked();
  const seen = new Set<string>();
  for (const file of files) {
    const id = await hashBytes(await file.arrayBuffer());
    if (seen.has(id)) continue;
    seen.add(id);
    const inbox = await dir('inbox');
    await writeFile(inbox, _bytesName(id, { kind: 'inbox', inboxAt: 0 }), file);
    const where: Where = { kind: 'inbox', inboxAt: Date.now() };
    const was: { where?: Where; took?: boolean } = {};
    await _updateRecord(id, (old) => {
      was.where = old?.where;
      // Already in the inbox, or better placed: unchanged.
      was.took = !old || _rank(old.where, linked) < _rank(where, linked);
      return was.took ? { ...old, path: _importName(file.name, file.type), where } : old;
    });
    if (was.took && was.where?.kind === 'removed') await (await dir('removed')).removeEntry(_bytesName(id, was.where)).catch(() => {});
    if (!was.took && was.where?.kind !== 'inbox') await inbox.removeEntry(id).catch(() => {});
  }
}

/** The bytes of a file in the inbox. */
export async function _inboxFile(id: string): Promise<File> {
  return (await (await dir('inbox')).getFileHandle(id)).getFile();
}

/** Delete a file's bytes from the inbox, once its record no longer says it is there. */
export async function _dropInboxBytes(id: string): Promise<void> {
  await (await dir('inbox')).removeEntry(id).catch(() => {});
}
