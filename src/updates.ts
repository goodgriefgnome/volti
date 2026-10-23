// Taking a new version of the app: at start-up, before anything shows, so an old version never
// shows and then reloads under you; and, while the app is open, when the library's Update button is
// tapped. The service worker doesn't take over until it is told to (sw.ts).

/** How long to look for a new version before opening the one installed. */
const LOOK_MS = 3000;
/** How long a new version may take to download, and then to take over, before opening the old one. */
const INSTALL_MS = 60_000;
const TAKE_OVER_MS = 10_000;
/** How often to look for a new version while the app is open. */
const LOOK_EVERY_MS = 30 * 60_000;

/** `p`, or `fallback` after `ms`. */
const within = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

/** The new version once it has downloaded, or null if that failed. */
function downloaded(w: ServiceWorker): Promise<ServiceWorker | null> {
  return new Promise((resolve) => {
    const check = () => {
      if (w.state === 'redundant') resolve(null);
      else if (w.state !== 'installing') resolve(w);
    };
    w.addEventListener('statechange', check);
    check();
  });
}

/**
 * Take a new version of the app if one is waiting, or is found within LOOK_MS: `updating` is
 * called while it downloads, and the page then reloads into it, so this doesn't resolve.
 * Otherwise (none, offline, or too slow) it resolves, to go on with the version installed.
 */
export async function takeUpdate(updating: () => void): Promise<void> {
  const sw = navigator.serviceWorker;
  // On a first visit there is no old version to show.
  if (!sw?.controller) return;
  const reg = await sw.getRegistration();
  if (!reg) return;
  let next = reg.waiting ?? reg.installing;
  if (!next && navigator.onLine) next = await within(reg.update().then(() => reg.installing ?? reg.waiting, () => null), LOOK_MS, null);
  if (!next) return;
  updating();
  const ready = await within(downloaded(next), INSTALL_MS, null);
  if (ready) await switchTo(ready);
}

/** Have a downloaded version take over and reload into it; resolves only if it doesn't take over in time. */
async function switchTo(ready: ServiceWorker): Promise<void> {
  const sw = navigator.serviceWorker;
  const took = new Promise<boolean>((resolve) => sw.addEventListener('controllerchange', () => resolve(true), { once: true }));
  ready.postMessage({ type: 'SKIP_WAITING' });
  if (!(await within(took, TAKE_OVER_MS, false))) return;
  location.reload();
  await new Promise(() => {});
}

/**
 * While the app is open, look for a new version now and then (when it comes back to the front,
 * and every LOOK_EVERY_MS; not offline). Once one has downloaded, `ready` is told, once, with a
 * function that switches to it.
 */
export async function watchForUpdates(ready: (take: () => void) => void) {
  const sw = navigator.serviceWorker;
  if (!sw) return;
  // Once the app's service worker is registered and running, even on a first visit.
  const reg = await sw.ready;
  let told = false;
  const offer = async (w: ServiceWorker | null) => {
    // Without a version in control (a first visit), the one installing is the first, not an update.
    if (!sw.controller) return;
    const got = w && (await downloaded(w));
    if (!got || told) return;
    told = true;
    ready(() => void switchTo(got));
  };
  // One found by the browser, or still downloading from start-up, counts too.
  reg.addEventListener('updatefound', () => void offer(reg.installing));
  void offer(reg.waiting ?? reg.installing);
  const look = () => { if (navigator.onLine && !told) void reg.update().catch(() => {}); };
  setInterval(look, LOOK_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') look(); });
}
