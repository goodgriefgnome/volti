// Start-up: registering the service worker, taking a new version of the app, asking for lasting
// storage, importing shared files and showing the library, plus importing the styles. Nothing that
// belongs to one screen goes here.

import { registerSW } from 'virtual:pwa-register';
import { Library } from './library/library';
import { importShared } from './originals/originals';
import { loadPrefs } from './storage/prefs';
import { el } from './ui/dom';
import { takeUpdate } from './updates';
// In this order: later files build on the earlier ones.
import './styles/base.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/cuts.css';
import './styles/overlay.css';
import './styles/setlists.css';

// Reloading into a new version is takeUpdate's to do, at start-up only.
registerSW({ immediate: true, onNeedReload: () => {} });

async function start() {
  // A plain start screen while looking for a new version, so an old one never shows first.
  const splash = el('div', 'start');
  const note = el('p', 'start-note');
  splash.append(el('p', 'brand', 'Volti'), note);
  document.body.append(splash);
  await takeUpdate(() => { note.textContent = 'Updating Volti…'; });
  splash.remove();

  // Keep imported scores and markings from being cleared when the tablet runs low on space.
  void navigator.storage?.persist?.().catch(() => {});

  const library = new Library(await loadPrefs());
  const shared = await importShared().catch(() => 0);
  if (location.search.includes('shared')) history.replaceState(null, '', location.pathname);
  if (shared) library.say(`Added ${shared} shared score${shared === 1 ? '' : 's'}.`);
  await library.refresh();
}

void start();
