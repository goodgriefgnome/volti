// The tools at the top of the library, beside the name: the scores folder's buttons (Link scores
// folder, Allow access), the library's ⋯ menu (the scores folder, Recently removed, Marking
// colours, and the storage used), and Update when a new version of the app is ready.

import { canLinkFolder } from '../originals/device-score-fs';
import { button, el } from '../ui/dom';
import { showMenu } from '../ui/overlay';
import type { LibraryHost } from './_host';
import { openMarkColors } from './_mark-colors';
import { openRecentlyRemoved } from './_removed';
import { storageView } from './_storage';
import { moreButton } from './_rows';

export class FolderBanner {
  readonly el = el('div', 'banner-tools');
  private folderTools = el('div', 'folder-tools');

  constructor(private lib: LibraryHost) {
    // The scores folder's tools beside the name, so Allow access is in sight as the library opens.
    this.el.append(this.folderTools);
  }

  /**
   * The scores folder's tools, for a folder that is set and forget: the one button that needs a
   * tap (Link scores folder while none is linked, Allow access while locked), then the library's
   * ⋯ menu: the scores folder's items, Recently removed, and the storage Volti uses on the tablet.
   */
  render() {
    const { lib } = this, p = this.folderTools, f = lib.folder;
    p.replaceChildren();
    if (f.kind === 'none' && canLinkFolder()) p.append(button('Link scores folder', () => void lib.link(), 'primary'));
    if (f.kind === 'locked') p.append(button('Allow access', () => void lib.unlock(), 'primary'));
    p.append(moreButton('Volti', (at) => showMenu(at, 'Volti', [
      f.kind !== 'none' && `Scores folder: ${f.name}`,
      f.kind !== 'none' && { label: 'Check for new scores', run: () => void lib.checkFolder() },
      f.kind !== 'none' && { label: 'Change folder…', run: () => void lib.link() },
      f.kind !== 'none' && { label: 'Unlink', run: () => void lib.unlink() },
      f.kind !== 'none' && lib.leftIn > 0 && { label: `Move ${lib.leftIn === 1 ? 'the score' : `${lib.leftIn} scores`} left in Volti…`, run: () => void lib.moveLeftIn() },
      { label: 'Recently removed…', run: () => void openRecentlyRemoved(lib) },
      { label: 'Marking colours…', run: openMarkColors },
      'Storage used on this tablet',
      storageView(),
    ]), 'More'));
  }

  /** A new version of the app is ready: offer it. `take` switches to it. */
  offerUpdate(take: () => void) {
    const b = button('Update', take, 'primary');
    b.title = 'A new version of Volti is ready';
    b.setAttribute('aria-label', 'Update Volti to the new version');
    this.el.prepend(b);
  }
}
