import { registerSW } from 'virtual:pwa-register';
import { importShared } from './lib/library';
import { loadPrefs } from './lib/prefs';
import { Home } from './ui/home';
import './styles.css';

registerSW({ immediate: true });

async function start() {
  // Keep imported scores and markings from being cleared when the tablet runs low on space.
  void navigator.storage?.persist?.().catch(() => {});

  const home = new Home(await loadPrefs());
  const shared = await importShared().catch(() => 0);
  if (location.search.includes('shared')) history.replaceState(null, '', location.pathname);
  if (shared) home.say(`Added ${shared} shared score${shared === 1 ? '' : 's'}.`);
  await home.refresh();
}

void start();
