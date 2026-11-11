// The requests Volti makes of the Google Drive API: listing folders, downloading and uploading
// files, creating folders, renaming, moving and trashing. Each goes through one helper that adds
// the access token and maps failures: no network is Unreachable, a token Google refuses twice is
// NoAccess (and signs out).

import type { _DriveAuth } from './_auth';
import { NoAccess, Unreachable } from '../types';

/** A file or folder in Drive. `sha256` is Drive's checksum of a file's bytes (none for a folder). */
export interface _DriveItem { id: string; name: string; folder: boolean; sha256?: string; created: string }

/** What Volti asks of Drive. DriveRoot and the folder picker use only this, so tests stand in for it. */
export interface _DriveApi {
  /** The folder's children, every page, not in the bin: files and folders. */
  children(folderId: string, signal?: AbortSignal): Promise<_DriveItem[]>;
  /** The children called `name`, not in the bin. */
  named(folderId: string, name: string): Promise<_DriveItem[]>;
  download(fileId: string): Promise<Blob>;
  /** A new file in `folderId`, or new contents for `over`. Gives its id. */
  upload(folderId: string, name: string, data: Blob, over?: string): Promise<string>;
  createFolder(parentId: string, name: string): Promise<string>;
  /** Rename and/or move a file (from `fromFolder` to `toFolder`), and/or take it out of the bin (`unbin`), in one request. */
  update(fileId: string, change: { name?: string; fromFolder?: string; toFolder?: string; unbin?: boolean }): Promise<void>;
  bin(fileId: string): Promise<void>;
}

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
const FIELDS = 'nextPageToken,files(id,name,mimeType,sha256Checksum,createdTime)';

/** `s` as a Drive query string literal. */
const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function _httpDriveApi(auth: _DriveAuth): _DriveApi {
  /** A request with the access token: one retry with a new token on a 401; a second signs out. */
  async function send(url: string, init: RequestInit = {}): Promise<Response> {
    for (let force = false; ; force = true) {
      const token = await auth.token(force);
      let res: Response;
      try {
        res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
      } catch (e) {
        if (init.signal?.aborted) throw e;
        throw new Unreachable("Google Drive can't be reached.", { cause: e });
      }
      if (res.status === 401) {
        if (force) { await auth.drop(); throw new NoAccess('Not signed in to Google Drive.'); }
        continue;
      }
      if (!res.ok) {
        const message = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? '';
        throw new Error(`Google Drive answered ${res.status} ${message}`.trim());
      }
      return res;
    }
  }

  const items = (files: { id: string; name: string; mimeType: string; sha256Checksum?: string; createdTime: string }[]): _DriveItem[] =>
    files.map((f) => ({ id: f.id, name: f.name, folder: f.mimeType === FOLDER, sha256: f.sha256Checksum, created: f.createdTime }));

  async function list(q: string, signal?: AbortSignal): Promise<_DriveItem[]> {
    const out: _DriveItem[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q, fields: FIELDS, pageSize: '1000', ...(pageToken ? { pageToken } : {}) });
      const json = (await (await send(`${API}?${params}`, { signal })).json()) as { files: Parameters<typeof items>[0]; nextPageToken?: string };
      out.push(...items(json.files));
      pageToken = json.nextPageToken;
    } while (pageToken);
    return out;
  }

  /** A multipart upload body: `meta` as JSON, then the bytes. */
  function multipart(meta: object, data: Blob): { body: Blob; type: string } {
    const boundary = 'volti' + Math.random().toString(36).slice(2);
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`, data, `\r\n--${boundary}--`]);
    return { body, type: `multipart/related; boundary=${boundary}` };
  }

  const json = { 'Content-Type': 'application/json' };

  return {
    children: (folderId, signal) => list(`${quote(folderId)} in parents and trashed=false`, signal),
    named: (folderId, name) => list(`${quote(folderId)} in parents and trashed=false and name=${quote(name)}`),
    download: async (fileId) => (await send(`${API}/${fileId}?alt=media`)).blob(),
    async upload(folderId, name, data, over) {
      const { body, type } = multipart(over ? { name } : { name, parents: [folderId] }, data);
      const url = over ? `${UPLOAD}/${over}?uploadType=multipart&fields=id` : `${UPLOAD}?uploadType=multipart&fields=id`;
      const res = await send(url, { method: over ? 'PATCH' : 'POST', headers: { 'Content-Type': type }, body });
      return ((await res.json()) as { id: string }).id;
    },
    async createFolder(parentId, name) {
      const res = await send(`${API}?fields=id`, { method: 'POST', headers: json, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }) });
      return ((await res.json()) as { id: string }).id;
    },
    async update(fileId, { name, fromFolder, toFolder, unbin }) {
      const params = new URLSearchParams({ fields: 'id', ...(toFolder && toFolder !== fromFolder ? { addParents: toFolder, removeParents: fromFolder ?? '' } : {}) });
      await send(`${API}/${fileId}?${params}`, { method: 'PATCH', headers: json, body: JSON.stringify({ ...(name === undefined ? {} : { name }), ...(unbin ? { trashed: false } : {}) }) });
    },
    async bin(fileId) {
      await send(`${API}/${fileId}?fields=id`, { method: 'PATCH', headers: json, body: JSON.stringify({ trashed: true }) });
    },
  };
}
