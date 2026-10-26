// Adding files to the library, from Add PDFs or shared from other apps (the inbox): each goes into
// the library's root, at its top, under its own name, or another where that is taken. A file the
// library already has (the same contents, perhaps under another name) isn't added again.

import { folderState, makeFolder, needAccess, whereIs, writeFile } from './folder';
import { hashBytes, rememberHash } from './hashes';
import { dropInbox, peekInbox } from './inbox';
import { freeName, importName, isOriginalFile, titleOf } from './names';
import { allOriginals } from './originals';

/**
 * Add PDFs and images to the top of the library's root; `already` has the titles of those it has.
 * Asks for write access to a linked folder (from a tap), or throws NoAccess.
 */
export async function addFiles(files: Iterable<File>): Promise<{ added: number; already: string[] }> {
  await needAccess('readwrite');
  const have = new Set((await allOriginals(await folderState())).map((o) => o.id));
  const top = await makeFolder('');
  const taken = new Set<string>();
  for await (const [name] of top.entries()) taken.add(name.toLowerCase());
  let added = 0;
  const already: string[] = [];
  for (const f of files) {
    if (!isOriginalFile(f)) continue;
    // Read once: on Android a picked file may not be readable a second time.
    const bytes = await f.arrayBuffer();
    const id = await hashBytes(bytes);
    const name = importName(f.name, f.type);
    if (have.has(id)) { already.push(titleOf(name)); continue; }
    const path = freeName(name, taken);
    await writeFile(top, path, bytes);
    // Its contents are known: no need to read it again.
    await rememberHash(await whereIs(path), await (await top.getFileHandle(path)).getFile(), id);
    have.add(id);
    taken.add(path.toLowerCase());
    added++;
  }
  return { added, already };
}

/**
 * Add the files shared to Volti, waiting in the inbox: how many were added. They wait there while
 * the linked folder can't be written to (NoAccess), until access is allowed.
 */
export async function addShared(): Promise<number> {
  const files = await peekInbox();
  if (!files.length) return 0;
  const { added } = await addFiles(files);
  await dropInbox(files.length);
  return added;
}
