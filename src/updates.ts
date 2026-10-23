// Taking a new version of the app at start-up, before anything shows, so an old version never
// shows and then reloads under you. A new version found later waits for the next start: the
// service worker doesn't take over until it is told to (sw.ts).

/** How long to look for a new version before opening the one installed. */
const LOOK_MS = 3000;
/** How long a new version may take to download, and then to take over, before opening the old one. */
const INSTALL_MS = 60_000;
const TAKE_OVER_MS = 10_000;

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
  if (!ready) return;
  const took = new Promise<boolean>((resolve) => sw.addEventListener('controllerchange', () => resolve(true), { once: true }));
  ready.postMessage({ type: 'SKIP_WAITING' });
  if (!(await within(took, TAKE_OVER_MS, false))) return;
  location.reload();
  await new Promise(() => {});
}
