// The tools at the top of the library, beside the name: the scores folder's (Link scores folder,
// Allow access, and ⋯ for the rest), and Update when a new version of the app is ready.

import { canLinkFolder } from '../originals/folder';
import { button, el } from '../ui/dom';
import { showMenu } from '../ui/overlay';
import type { LibraryHost } from './host';
import { moreButton } from './rows';

export class FolderBanner {
  readonly el = el('div', 'banner-tools');
  private folderTools = el('div', 'folder-tools');

  constructor(private lib: LibraryHost) {
    // The scores folder's tools beside the name, so Allow access is in sight as the library opens.
    this.el.append(this.folderTools);
  }

  /**
   * The scores folder's tools, for a folder that is set and forget: the one button that needs a
   * tap (Link scores folder while none is linked, Allow access while locked), and ⋯ for the rest.
   */
  render() {
    const { lib } = this, p = this.folderTools, f = lib.folder;
    p.replaceChildren();
    if (f.kind === 'none') {
      if (canLinkFolder()) p.append(button('Link scores folder', () => void lib.link(), 'primary'));
      return;
    }
    if (f.kind === 'locked') p.append(button('Allow access', () => void lib.unlock(), 'primary'));
    p.append(moreButton(f.name, (at) => showMenu(at, `Scores folder: ${f.name}`, [
      { label: 'Change folder…', run: () => void lib.link() },
      { label: 'Unlink', run: () => void lib.unlink() },
    ]), 'Scores folder'));
  }

  /** A new version of the app is ready: offer it. `take` switches to it. */
  offerUpdate(take: () => void) {
    const b = button('Update', take, 'primary');
    b.title = 'A new version of Volti is ready';
    b.setAttribute('aria-label', 'Update Volti to the new version');
    this.el.prepend(b);
  }
}
