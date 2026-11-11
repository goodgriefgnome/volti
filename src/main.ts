// Start-up: registering the service worker, taking a new version of the app, bringing the stored
// data up to its version, keeping dialogs above the on-screen keyboard, asking for lasting storage,
// importing shared files and showing the library, plus importing the styles. Nothing that belongs to one screen goes here.

import { registerSW } from 'virtual:pwa-register';
import { Library } from './library/library';
import { loadMarkingColors } from './markings/store';
import { finishSignIn } from './originals/drive/score-fs';
import { tidyStorage } from './originals/library-files';
import { purgeRemoved } from './originals/removed-fs';
import { upgradeStoredData } from './stored-data';
import { button, el } from './ui/dom';
import { followVisibleArea } from './ui/overlay';
import { takeUpdate, watchForUpdates } from './updates';
import { failed, failedOnce } from './ui/failure';
// In this order: later files build on the earlier ones.
import './styles/base.css';
import './styles/ui.css';
import './styles/library.css';
import './styles/dialogs.css';
import './styles/reader.css';
import './styles/face.css';

// Reloading into a new version is takeUpdate's to do, at start-up only.
registerSW({ immediate: true, onNeedReload: () => {} });
followVisibleArea();

async function start() {
  // A plain start screen while looking for a new version, so an old one never shows first.
  const splash = el('div', 'start');
  const note = el('p', 'start-note');
  splash.append(el('p', 'brand', 'Volti'), note);
  document.body.append(splash);
  await takeUpdate(() => { note.textContent = 'Updating Volti…'; });
  if (!(await upgradeOnSplash(splash, note))) return;
  splash.remove();

  // Keep the scores added to the app, and markings, from being cleared when the tablet runs low on space.
  void navigator.storage?.persist?.().catch(() => {});

  // Back from Google's sign-in page, finish it before the library reads the folder.
  let signedIn: Awaited<ReturnType<typeof finishSignIn>>, signInFailed: string | undefined;
  try { signedIn = await finishSignIn(); } catch (e) { signInFailed = failed('sign in to Google Drive', e); }
  const library = new Library();
  void watchForUpdates((take) => library.offerUpdate(take));
  await tidyStorage().catch((e) => failedOnce('tidy the storage', e));
  // Files removed a week ago or more are deleted for good.
  await purgeRemoved().catch((e) => failedOnce('clear out Recently removed', e));
  await library.addShared();
  if (location.search.includes('shared')) history.replaceState(null, '', location.pathname);
  await loadMarkingColors().catch((e) => failedOnce('load the marking colours', e));
  await library.refresh();
  if (signInFailed) library.say(signInFailed);
  // Signing in to link a folder goes on to pick it; signing in again was scanned by the refresh.
  else if (signedIn === 'link') await library.pickDriveFolder();
}

/**
 * Bring the stored data up to the app's version, on the start screen: nothing else can be done until
 * it is. On failure, a Try again button runs it again, as often as needed. False when the data is
 * from a newer version of Volti: the start screen stays.
 */
async function upgradeOnSplash(splash: HTMLElement, note: HTMLElement): Promise<boolean> {
  for (;;) {
    try {
      const result = await upgradeStoredData(() => { note.textContent = 'Updating your scores…'; });
      if (result === 'done') return true;
      note.textContent = 'These scores were saved by a newer version of Volti. Open Volti again to update it.';
      return false;
    } catch (e) {
      console.error('Could not update the stored data:', e);
      note.textContent = 'Could not update your scores.';
      await new Promise<void>((resolve) => {
        const retry = button('Try again', () => { retry.remove(); resolve(); });
        splash.append(retry);
      });
    }
  }
}

void start();
