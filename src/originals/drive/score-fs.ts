// The Google Drive side of the scores folder: whether Drive is offered, signing in (which leaves
// the page) and finishing it at start-up, the folders the chooser shows, a Drive folder's root,
// and the copies of its files kept on the tablet.

import { _byteCache } from './_byte-cache';
import { _httpDriveApi } from './_api';
import { _authUrl, _challenge, _driveAuth, _newVerifier } from './_auth';
import { _clientId, _redirectUri } from './_config';
import { DriveRoot } from './_root';
import { _storedLink } from '../_folder-link';
import { _record } from '../_record-store';
import { NoAccess, Unreachable } from '../types';

/** What the page was doing when it left for Google's sign-in page. */
type Intent = 'link' | 'unlock';
interface Waiting { verifier: string; state: string; intent: Intent }

/** Where the verifier, state and intent wait while the page is away. */
const WAITING = 'volti-drive-sign-in';

/** Whether this build has a Google client (drive/_config.ts). */
export const driveOffered = (): boolean => _clientId !== '';

/** Whether there is a sign-in to Google now. */
export const driveSignedIn = (): Promise<boolean> => _driveAuth.signedIn();

/** Leave for Google's sign-in page; back at Volti's URL, `finishSignIn` picks up `intent`. */
export async function signInToDrive(intent: Intent): Promise<never> {
  const verifier = _newVerifier(), state = _newVerifier();
  sessionStorage.setItem(WAITING, JSON.stringify({ verifier, state, intent } satisfies Waiting));
  location.assign(_authUrl({ clientId: _clientId, redirectUri: _redirectUri(), challenge: await _challenge(verifier), state }));
  // The page is going away: nothing after this is run.
  return new Promise<never>(() => {});
}

/** What the address says Google sent back, with what was kept for it. Undefined when it has no return from Google; throws when it is one that can't be taken. */
export function _signInReturn(search: string, saved: Waiting | undefined): { code: string; verifier: string; intent: Intent } | undefined {
  const q = new URLSearchParams(search);
  if (!q.has('code') && !q.has('error')) return undefined;
  if (q.has('error')) throw new Error(`Google Drive sign-in was not completed: ${q.get('error')}`);
  if (!saved || saved.state !== q.get('state')) throw new Error('Google Drive sign-in did not match the one started');
  return { code: q.get('code')!, verifier: saved.verifier, intent: saved.intent };
}

/** The parameters Google adds to the address on its way back. */
const RETURN_PARAMS = ['code', 'state', 'scope', 'error', 'error_description', 'authuser', 'prompt', 'hd'];

/**
 * At start-up, before the library: when the address has `?code=…&state=…` (or `?error=…`) from
 * Google, exchange the code, take them off the address, and give what was being done. Undefined
 * when the address has none. Throws when signing in failed.
 */
export async function finishSignIn(): Promise<Intent | undefined> {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return undefined;
  let saved: Waiting | undefined;
  try { saved = JSON.parse(sessionStorage.getItem(WAITING) ?? 'null') ?? undefined; } catch { /* taken as none */ }
  try { sessionStorage.removeItem(WAITING); } catch { /* nothing to delete */ }
  const search = location.search;
  for (const k of RETURN_PARAMS) q.delete(k);
  history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
  const back = _signInReturn(search, saved);
  if (!back) return undefined;
  await _driveAuth.exchange(back.code, back.verifier, _redirectUri());
  return back.intent;
}

/** The folders in a Drive folder ('root' for My Drive), by name. */
export async function driveFolders(parentId: string): Promise<{ id: string; name: string }[]> {
  const items = await _httpDriveApi(_driveAuth).children(parentId);
  return items.filter((i) => i.folder).map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

let root: DriveRoot | undefined;
let rootOf: string | undefined;
/** The root over a Drive folder, one per folder id. */
export function _driveRoot(folderId: string): DriveRoot {
  if (rootOf !== folderId || !root) {
    root = new DriveRoot(folderId, _httpDriveApi(_driveAuth), _driveAuth, _byteCache);
    rootOf = folderId;
  }
  return root;
}

/** Sign out: revoke and forget the refresh token, and empty the byte cache (unlinking). */
export async function _forgetDrive(): Promise<void> {
  root = undefined;
  rootOf = undefined;
  await _driveAuth.signOut();
  await _byteCache.clear();
}

/**
 * Download each of `ids` that has no bytes kept yet, one at a time, from `root` at the path
 * `pathOf` gives (none: skipped). Stops quietly when Drive can't be reached or there is no sign-in:
 * the next run of the offline job tries again. A file that can't be read otherwise is left.
 */
export async function _downloadMissing(
  ids: readonly string[], pathOf: (id: string) => string | undefined,
  root: { read(path: string, id?: string): Promise<File> }, cache: { has(id: string): Promise<boolean> },
): Promise<void> {
  for (const id of ids) {
    const path = pathOf(id);
    if (path === undefined || await cache.has(id)) continue;
    try { await root.read(path, id); } catch (e) {
      if (e instanceof NoAccess || e instanceof Unreachable) return;
      console.warn(`Keeping ${path} offline: could not download it:`, e);
    }
  }
}

/**
 * Keep these originals' bytes on the tablet for good (the offline job's setlist scores): pinned,
 * and, in a Drive folder, downloaded when not kept yet. A device folder has its files already.
 */
export async function pinOriginals(ids: readonly string[]): Promise<void> {
  await _byteCache.pin(ids);
  const link = await _storedLink();
  if (link?.kind !== 'drive' || !link.linked) return;
  await _downloadMissing(ids, (id) => {
    const r = _record(id);
    return r?.where.kind === 'folder' ? r.path : undefined;
  }, _driveRoot(link.folderId), _byteCache);
}

/** How many bytes of Drive files are kept on the tablet, for the storage screen. */
export const keptFromDriveBytes = (): Promise<number> => _byteCache.size();
