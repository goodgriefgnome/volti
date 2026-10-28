// Start-up: registering the service worker, taking a new version of the app, keeping dialogs above
// the on-screen keyboard, asking for lasting storage, importing shared files and showing the
// library, plus importing the styles. Nothing that belongs to one screen goes here.

import { registerSW } from 'virtual:pwa-register';
import { Library } from './library/library';
import { purgeRemoved } from './originals/trash-fs';
import { el } from './ui/dom';
import { followVisibleArea } from './ui/overlay';
import { takeUpdate, watchForUpdates } from './updates';
// In this order: later files build on the earlier ones.
import './styles/base.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/cuts.css';
import './styles/overlay.css';
import './styles/setlists.css';

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
  splash.remove();

  // Keep the scores added to the app, and markings, from being cleared when the tablet runs low on space.
  void navigator.storage?.persist?.().catch(() => {});

  const library = new Library();
  void watchForUpdates((take) => library.offerUpdate(take));
  // Files removed a week ago or more are deleted for good.
  await purgeRemoved().catch((e) => console.warn('Could not clear out Recently removed:', e));
  await library.addShared();
  if (location.search.includes('shared')) history.replaceState(null, '', location.pathname);
  await library.refresh();
}

void start();
