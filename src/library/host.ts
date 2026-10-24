// What the library's parts (the folder banner, the setlists and the scores) need from the Library:
// what it has read, and what they may ask it to do. The Library holds the data; the parts only
// show it and ask for changes.

import type { ExcerptSource } from '../dialogs/excerpt-picker';
import type { ExcerptHost } from '../dialogs/excerpts';
import type { FileChange } from '../dialogs/score-files';
import type { Span } from '../excerpts/span';
import type { FolderState } from '../originals/folder';
import type { Original } from '../originals/originals';
import type { Aspects, ExcerptName, Score } from '../scores/model';
import type { Setlist } from '../setlists/model';
import type { MenuItem } from '../ui/overlay';
import type { Toast } from '../ui/toast';
import type { LibraryScore } from '../dialogs/open-score';

export interface LibraryHost {
  readonly folder: FolderState;
  /** The library's scores' originals, by title. */
  readonly originals: readonly Original[];
  /** New PDFs are still being read. */
  readonly reading: boolean;
  readonly setlists: readonly Setlist[];
  /** Scores as last saved, and their originals' page shapes: for their named excerpts, and the excerpt each entry plays. */
  readonly saved: ReadonlyMap<string, Score>;
  readonly shapes: ReadonlyMap<string, Aspects>;
  /** The scores whose PDF needs a password not given yet, by id. */
  readonly locked: ReadonlySet<string>;
  /** The rows opened (a setlist's scores, a score's named excerpts), by id, while the app runs. */
  readonly openRows: Set<string>;
  readonly toast: Toast;

  /** Say something in the status line under the name. */
  say(text: string): void;
  originalOf(scoreId: string): Original | undefined;
  /** A score's title, even when its original is missing. */
  titleOf(scoreId: string): string;
  setlist(id: string): Setlist | undefined;
  /** Change the setlists, save the ones that changed (with `also`, other records that go with them), and show them. */
  change(next: Setlist[], also?: [string, unknown][]): Promise<void>;
  /** Change one setlist. */
  update(s: Setlist): Promise<void>;
  deleteSetlist(s: Setlist): Promise<void>;
  /** Note the setlist scores were just added to, which is the default from now on. */
  addedTo(id: string): void;
  /** Read the folder and the imported copies again, and show them. */
  refresh(): Promise<void>;
  /** Scores' files changed here or in the reader: show the changes at once, then read the scores again. */
  filesChanged(changes: readonly FileChange[]): void;
  /** Show the setlists and the scores again. */
  render(): void;

  link(): Promise<void>;
  /** Allow access to the linked folder this session; false, having said why, when it isn't. */
  unlock(): Promise<boolean>;
  unlink(): Promise<void>;

  /** "Add to <default setlist>" and "Add to setlist…" for a score, or the excerpt `span` of it, called `what`. */
  addToItems(anchor: Element, scoreId: string, what: string, span?: Span): MenuItem[];
  /** Export scores (whole or excerpts of them) as one PDF, named `title` to start with. */
  exportPdf(title: string, what: (Span & { scoreId: string })[]): void;
  /** Changing a score's named excerpts here, saving them as they change. */
  excerptHost(scoreId: string): ExcerptHost;
  /** Open a score's original for a dialog over the library; null, having said why, when it can't be. */
  openForDialog(o: Original): Promise<LibraryScore | null>;
  /** Open the score for a dialog, then `pick` from it; it closes with the dialog. */
  withPages(o: Original, pick: (sc: LibraryScore) => void): Promise<void>;
  /** Keep a score opened for a dialog, for naming the excerpts entries play. */
  remember(sc: ExcerptSource): void;

  /**
   * Ask for a locked score's password (true at once for one not locked), as adding it to a setlist
   * does; false when it isn't given.
   */
  givePassword(o: Original): Promise<boolean>;

  /** Read a score from where it was left. */
  open(o: Original): void;
  /** Read a named excerpt, from its start. */
  readExcerpt(o: Original, x: ExcerptName): void;
  /** Play a setlist from its first entry, or from one of its entries. */
  play(s: Setlist, startEntry?: string): void;
}
