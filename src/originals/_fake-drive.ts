// Google Drive in memory, standing in for the Drive API in tests: the _DriveApi that DriveRoot
// and the folder chooser use. Only tests import it.

import type { _DriveApi, _DriveItem } from './_drive-api';
import { hashBytes } from './_filesystem-utils';
import { NoAccess, Unreachable } from './types';

interface Item { id: string; name: string; parent: string; folder: boolean; bytes: Uint8Array; created: number; trashed: boolean }

const notFound = (id: string) => new Error(`Google Drive answered 404 File not found: ${id}`);

export class FakeDrive implements _DriveApi {
  /** Every method throws Unreachable. */
  down = false;
  /** Every method throws NoAccess. */
  revoked = false;
  /** What was asked, as `method id…`, in order. */
  requests: string[] = [];
  /** The id of the linked folder. */
  readonly root = 'root';
  private items = new Map<string, Item>();
  private next = 1;

  private gate(what: string) {
    this.requests.push(what);
    if (this.down) throw new Unreachable('Google Drive is unreachable');
    if (this.revoked) throw new NoAccess('Signed out of Google Drive');
  }

  private item(id: string): Item {
    const i = this.items.get(id);
    if (!i) throw notFound(id);
    return i;
  }

  private asItem = async (i: Item): Promise<_DriveItem> => ({
    id: i.id, name: i.name, folder: i.folder, created: String(i.created).padStart(12, '0'),
    sha256: i.folder ? undefined : await hashBytes(i.bytes.slice().buffer),
  });

  private kids(folderId: string) {
    return [...this.items.values()].filter((i) => i.parent === folderId && !i.trashed);
  }

  /* ---------- the API ---------- */

  async children(folderId: string): Promise<_DriveItem[]> {
    this.gate(`children ${folderId}`);
    return Promise.all(this.kids(folderId).map(this.asItem));
  }

  async named(folderId: string, name: string): Promise<_DriveItem[]> {
    this.gate(`named ${folderId} ${name}`);
    return Promise.all(this.kids(folderId).filter((i) => i.name === name).map(this.asItem));
  }

  async download(fileId: string): Promise<Blob> {
    this.gate(`download ${fileId}`);
    return new Blob([this.item(fileId).bytes.slice()]);
  }

  async upload(folderId: string, name: string, data: Blob, over?: string): Promise<string> {
    this.gate(`upload ${folderId} ${name}`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (over) { const i = this.item(over); i.bytes = bytes; i.name = name; return over; }
    return this.add(folderId, name, bytes, false);
  }

  async createFolder(parentId: string, name: string): Promise<string> {
    this.gate(`createFolder ${parentId} ${name}`);
    return this.add(parentId, name, new Uint8Array(), true);
  }

  async update(fileId: string, change: { name?: string; fromFolder?: string; toFolder?: string }): Promise<void> {
    this.gate(`update ${fileId}`);
    const i = this.item(fileId);
    if (change.name !== undefined) i.name = change.name;
    if (change.toFolder && change.toFolder !== change.fromFolder) {
      if (change.fromFolder !== i.parent) throw new Error('removeParents is not a parent');
      i.parent = change.toFolder;
    }
  }

  async trash(fileId: string): Promise<void> {
    this.gate(`trash ${fileId}`);
    this.item(fileId).trashed = true;
  }

  /* ---------- for tests ---------- */

  private add(parent: string, name: string, bytes: Uint8Array, folder: boolean): string {
    const id = 'd' + this.next;
    this.items.set(id, { id, name, parent, folder, bytes, created: this.next++, trashed: false });
    return id;
  }

  /** A folder, even when one of that name is there (Drive allows two). */
  addFolder(parent: string, name: string): string {
    return this.add(parent, name, new Uint8Array(), true);
  }

  /** A file, even when one of that name is there (Drive allows two). */
  addFile(parent: string, name: string, text: string): string {
    return this.add(parent, name, new TextEncoder().encode(text), false);
  }

  /** The file at `path`, making the folders on it (reusing those there), as if by Drive's website. */
  put(path: string, text: string): string {
    const parts = path.split('/');
    let parent = this.root;
    for (const p of parts.slice(0, -1)) {
      parent = this.kids(parent).find((i) => i.folder && i.name === p)?.id ?? this.addFolder(parent, p);
    }
    return this.addFile(parent, parts.at(-1)!, text);
  }

  /** Put a file, or a folder, in Drive's trash, as if by its website. */
  trashItem(id: string): void {
    this.item(id).trashed = true;
  }

  /** The path of an item, from the root. */
  private pathOf(i: Item): string {
    return i.parent === this.root ? i.name : `${this.pathOf(this.item(i.parent))}/${i.name}`;
  }

  /** The paths of all the files not in the trash, sorted. */
  paths(): string[] {
    return [...this.items.values()].filter((i) => !i.folder && !i.trashed).map((i) => this.pathOf(i)).sort();
  }

  /** The paths of the files in the trash, sorted. */
  trashed(): string[] {
    return [...this.items.values()].filter((i) => !i.folder && i.trashed).map((i) => this.pathOf(i)).sort();
  }

  /** The contents of the file at `path`, if there is one. */
  text(path: string): string | undefined {
    const i = [...this.items.values()].find((x) => !x.folder && !x.trashed && this.pathOf(x) === path);
    return i && new TextDecoder().decode(i.bytes);
  }

  /** How many requests of a method were made. */
  count(method: string): number {
    return this.requests.filter((r) => r.startsWith(method + ' ')).length;
  }
}

/** Drive in memory with files at these paths (path → contents). */
export function _fakeDrive(files: Record<string, string> = {}): FakeDrive {
  const d = new FakeDrive();
  for (const [path, text] of Object.entries(files)) d.put(path, text);
  return d;
}
