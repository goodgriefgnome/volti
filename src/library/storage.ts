// How much room Volti takes on the tablet, for the library's ⋯ menu: its parts worked out from the
// files' sizes and the browser's estimate, and shown as one stacked bar with each part's size.

import { importedBytes } from '../originals/imported';
import { picturesBytes } from '../pictures/pictures';
import { el } from '../ui/dom';

/** One part of the room Volti takes: `key` names its colour. */
export interface StoragePart { key: 'meta' | 'added' | 'cache' | 'app' | 'other'; name: string; bytes: number }

/**
 * What the browser says Volti takes: in all, and (in Chrome) by store, which leaves out a store
 * holding nothing.
 */
export interface Estimate { usage: number; details?: { indexedDB?: number; caches?: number } }

/**
 * The parts, from the browser's estimate and the sizes of the added scores and the saved pictures
 * (both in the origin private file system). Without the estimate's details, metadata and the
 * offline binary are one part, the rest of the total. Pure.
 */
export function storageParts(e: Estimate, added: number, cache: number): StoragePart[] {
  const known: StoragePart[] = [
    { key: 'added', name: 'Added scores', bytes: added },
    { key: 'cache', name: 'Setlist cache', bytes: cache },
  ];
  if (!e.details) return [{ key: 'other', name: 'Metadata and offline binary', bytes: Math.max(0, e.usage - added - cache) }, ...known];
  return [{ key: 'meta', name: 'Metadata', bytes: e.details.indexedDB ?? 0 }, ...known, { key: 'app', name: 'Offline binary', bytes: e.details.caches ?? 0 }];
}

/** A size as people read it: "410 KB", "186 MB", "1.2 GB". Pure. */
export function formatBytes(b: number): string {
  const MB = 1024 * 1024;
  if (b < MB) return `${Math.max(b > 0 ? 1 : 0, Math.round(b / 1024))} KB`;
  if (b < 1024 * MB) return `${(b / MB).toFixed(b < 10 * MB ? 1 : 0)} MB`;
  return `${(b / 1024 / MB).toFixed(1)} GB`;
}

async function measure(): Promise<StoragePart[]> {
  const [estimate, added, cache] = await Promise.all([navigator.storage.estimate(), importedBytes(), picturesBytes()]);
  // Chrome's breakdown by store; other browsers give the total only.
  const details = (estimate as StorageEstimate & { usageDetails?: { indexedDB?: number; caches?: number } }).usageDetails;
  return storageParts({ usage: estimate.usage ?? 0, details }, added, cache);
}

/** The storage view for the menu: "Working out…" until the sizes are known. */
export function storageView(): HTMLElement {
  const view = el('div', 'storage');
  view.append(el('p', 'storage-total', 'Working out…'));
  void measure().then((parts) => {
    const total = parts.reduce((n, p) => n + p.bytes, 0);
    const bar = el('div', 'storage-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', parts.map((p) => `${p.name} ${formatBytes(p.bytes)}`).join(', '));
    const list = el('div', 'storage-parts');
    for (const p of parts) {
      const seg = el('i', 'part-' + p.key);
      seg.style.width = `${total ? (p.bytes / total) * 100 : 0}%`;
      bar.append(seg);
      const row = el('div', 'storage-part');
      row.append(el('span', 'swatch part-' + p.key), el('span', '', p.name), el('span', 'size', formatBytes(p.bytes)));
      list.append(row);
    }
    view.replaceChildren(el('p', 'storage-total', formatBytes(total)), bar, list);
  }, (e) => {
    console.warn('Could not work out the storage used:', e);
    view.replaceChildren(el('p', 'storage-total', 'Can’t tell on this browser.'));
  });
  return view;
}
