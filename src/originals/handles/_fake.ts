// A folder tree in memory, standing in for a FileSystemDirectoryHandle in tests: the parts of the
// handle API that the roots in handles/_roots.ts use. Only tests import it.

interface Options {
  /** Names match ignoring case, as in some of Android's folders. */
  ignoreCase?: boolean;
  /** Files have no `move`, so the roots copy. */
  noMove?: boolean;
  permission?: PermissionState;
}

/** What the tree shares: its options, and what tests set and count. */
interface Context extends Options {
  /** How many times each file's `getFile()` was called, by path. */
  reads: Map<string, number>;
  /** `write()` of a writable throws. */
  failWrite: boolean;
  /** `removeEntry` throws. */
  failRemove: boolean;
  /** What `requestPermission` answers, when it is set. */
  requestAnswer?: PermissionState;
  /** The next modified time of a file written. */
  clock: number;
}

const notFound = (name: string) => new DOMException(`No ${name}`, 'NotFoundError');

class FakeFile {
  readonly kind = 'file';
  move?: (a: FakeDirectory | string, b?: string) => Promise<void>;
  constructor(public name: string, public parent: FakeDirectory, public bytes: Uint8Array, public modified: number, private ctx: Context) {
    if (!ctx.noMove) {
      this.move = async (a, b) => {
        const [into, name] = typeof a === 'string' ? [this.parent, a] : [a, b!];
        if (into.entry(name) && into.entry(name) !== this) throw new DOMException('Taken', 'InvalidModificationError');
        this.parent.children.delete(this.name);
        this.name = name;
        this.parent = into;
        into.children.set(name, this);
      };
    }
  }

  get path(): string {
    return this.parent.path + this.name;
  }

  async getFile(): Promise<File> {
    // A handle to a file deleted since can't get it.
    if (this.parent.children.get(this.name) !== this) throw notFound(this.name);
    this.ctx.reads.set(this.path, (this.ctx.reads.get(this.path) ?? 0) + 1);
    return new File([this.bytes as BlobPart], this.name, { lastModified: this.modified });
  }

  async createWritable() {
    let bytes = new Uint8Array();
    return {
      write: async (data: Blob | ArrayBuffer | string) => {
        if (this.ctx.failWrite) throw new Error('Write failed');
        bytes = new Uint8Array(typeof data === 'string' ? new TextEncoder().encode(data) : await new Blob([data]).arrayBuffer());
      },
      close: async () => {
        this.bytes = bytes;
        this.modified = this.ctx.clock++;
      },
    };
  }

  async isSameEntry(other: unknown) {
    return other === this;
  }
}

/** A folder; the one `_fakeFolder` gives is the root. */
export class FakeDirectory {
  readonly kind = 'directory';
  children = new Map<string, FakeDirectory | FakeFile>();
  constructor(public name: string, private parent: FakeDirectory | undefined, readonly ctx: Context) {}

  /** The path of this folder from the root, ending in a slash ('' for the root). */
  get path(): string {
    return this.parent ? this.parent.path + this.name + '/' : '';
  }

  /** The entry called `name`, finding it in any case where the tree ignores case. */
  entry(name: string): FakeDirectory | FakeFile | undefined {
    if (!this.ctx.ignoreCase) return this.children.get(name);
    return [...this.children].find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1];
  }

  async *entries(): AsyncGenerator<[string, FakeDirectory | FakeFile]> {
    for (const e of [...this.children]) yield e;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirectory> {
    const e = this.entry(name);
    if (e instanceof FakeDirectory) return e;
    if (e) throw new DOMException('Not a folder', 'TypeMismatchError');
    if (!options?.create) throw notFound(name);
    const d = new FakeDirectory(name, this, this.ctx);
    this.children.set(name, d);
    return d;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFile> {
    const e = this.entry(name);
    if (e instanceof FakeFile) return e;
    if (e) throw new DOMException('Not a file', 'TypeMismatchError');
    if (!options?.create) throw notFound(name);
    const f = new FakeFile(name, this, new Uint8Array(), this.ctx.clock++, this.ctx);
    this.children.set(name, f);
    return f;
  }

  async removeEntry(name: string): Promise<void> {
    if (this.ctx.failRemove) throw new Error('Remove failed');
    const e = this.entry(name);
    if (!e) throw notFound(name);
    this.children.delete([...this.children].find(([, v]) => v === e)![0]);
  }

  async isSameEntry(other: unknown) {
    return other === this;
  }

  async queryPermission() {
    return this.ctx.permission ?? 'granted';
  }

  async requestPermission() {
    return this.ctx.requestAnswer ?? this.ctx.permission ?? 'granted';
  }

  /* ---------- for tests ---------- */

  /** The file at `path`, if any. */
  private at(path: string): FakeFile | undefined {
    let d: FakeDirectory = this;
    const parts = path.split('/');
    for (const p of parts.slice(0, -1)) {
      const e = d.children.get(p);
      if (!(e instanceof FakeDirectory)) return undefined;
      d = e;
    }
    const f = d.children.get(parts.at(-1)!);
    return f instanceof FakeFile ? f : undefined;
  }

  /** Put a file at `path`, making its folders, as if by another app. */
  put(path: string, bytes: string, modified = this.ctx.clock++): void {
    let d: FakeDirectory = this;
    const parts = path.split('/');
    for (const p of parts.slice(0, -1)) {
      let e = d.children.get(p);
      if (!(e instanceof FakeDirectory)) d.children.set(p, (e = new FakeDirectory(p, d, this.ctx)));
      d = e;
    }
    const name = parts.at(-1)!;
    d.children.set(name, new FakeFile(name, d, new TextEncoder().encode(bytes), modified, this.ctx));
  }

  /** Delete the file at `path`, as if by another app. */
  drop(path: string): void {
    const f = this.at(path);
    f?.parent.children.delete(f.name);
  }

  /** The contents at `path`, or undefined if there is no file. */
  text(path: string): string | undefined {
    const f = this.at(path);
    return f && new TextDecoder().decode(f.bytes);
  }

  /** The paths of all the files, sorted. */
  paths(): string[] {
    const out: string[] = [];
    const go = (d: FakeDirectory) => {
      for (const [, e] of d.children) {
        if (e instanceof FakeDirectory) go(e);
        else out.push(e.path);
      }
    };
    go(this);
    return out.sort();
  }

  get reads() {
    return this.ctx.reads;
  }

  set failWrite(v: boolean) {
    this.ctx.failWrite = v;
  }

  set failRemove(v: boolean) {
    this.ctx.failRemove = v;
  }

  set requestAnswer(v: PermissionState | undefined) {
    this.ctx.requestAnswer = v;
  }
}

/** A folder tree in memory, standing in for a FileSystemDirectoryHandle in tests. */
export function _fakeFolder(files: Record<string, { bytes: string; modified?: number }>, options: Options = {}): FakeDirectory {
  const root = new FakeDirectory('', undefined, { ...options, reads: new Map(), failWrite: false, failRemove: false, clock: 1000 });
  for (const [path, f] of Object.entries(files)) root.put(path, f.bytes, f.modified);
  return root;
}
