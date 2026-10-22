import { registerSW } from 'virtual:pwa-register';
import { Library } from './library/library';
import { importShared } from './sources/scores';
import { loadPrefs } from './storage/prefs';
// In this order: later files build on the earlier ones.
import './styles/base.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/cuts.css';
import './styles/overlay.css';
import './styles/setlists.css';

registerSW({ immediate: true });

async function start() {
  // Keep imported scores and markings from being cleared when the tablet runs low on space.
  void navigator.storage?.persist?.().catch(() => {});

  const library = new Library(await loadPrefs());
  const shared = await importShared().catch(() => 0);
  if (location.search.includes('shared')) history.replaceState(null, '', location.pathname);
  if (shared) library.say(`Added ${shared} shared score${shared === 1 ? '' : 's'}.`);
  await library.refresh();
}

void start();
