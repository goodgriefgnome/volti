// Access to the scores folder from the reader: whether what is read can be read from its files,
// and asking for access from a tap, then reading the scores from their files and showing the
// screen again.

import { folderStatus, unlockFolder } from '../originals/linked-folder';
import type { OpenScores } from './_open-scores';
import type { Pager } from './_pager';
import type { Screen } from './_screen';

export interface FolderAccessHost {
  scores: OpenScores;
  say(text: string): void;
  hideToast(): void;
}

export class FolderAccess {
  constructor(private host: FolderAccessHost, private pager: Pager, private screen: Screen) {}

  /** Whether the score read can be read from its file; false when access isn't allowed. */
  readable(): boolean {
    if (this.pager.items[this.pager.k]?.needsAccess) return false;
    const cur = this.pager.current;
    return !cur?.draw || !!cur.readable;
  }

  /**
   * When the score read couldn't be read from its file for want of access to the scores folder, ask
   * for it, from a tap: then read the scores from their files, and show the screen again. False,
   * having said why, when it isn't allowed.
   */
  async allow(): Promise<boolean> {
    const { host, pager } = this;
    if (pager.items[pager.k]?.fileGone) {
      host.say('The file for this score is gone, so only its saved pages can be shown.');
      return false;
    }
    if (this.readable()) return true;
    const at = this.screen.slots[0]?.frame.items[0]?.cut.id;
    await unlockFolder().catch(() => false);
    host.scores.accessAllowed();
    await host.scores.ensure(pager.k, true);
    if (!this.readable()) {
      const folder = await folderStatus();
      host.say(folder.kind !== 'none' && folder.place === 'drive'
        ? 'Sign in to Google Drive from the library to read this score.'
        : 'Volti can’t read the scores folder without access.');
      return false;
    }
    host.hideToast();
    void pager.goTo(pager.k, at);
    return true;
  }

  /** Do something that needs the files (editing cuts, picking an excerpt), asking for access first if need be. */
  async withAccess(f: () => void): Promise<void> {
    if (await this.allow()) f();
  }
}
