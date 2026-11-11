import { afterEach, describe, expect, it, vi } from 'vitest';
import { _httpDriveApi } from './_api';
import type { _DriveAuth } from './_auth';
import { NoAccess, Unreachable } from '../types';

const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
const stub = (...answers: (Response | Error)[]) => {
  const f = vi.fn(async (..._args: unknown[]) => { const a = answers.shift()!; if (a instanceof Error) throw a; return a; });
  vi.stubGlobal('fetch', f);
  return f;
};
const fakeAuth = () => {
  const calls: boolean[] = [];
  const auth = { token: vi.fn(async (force = false) => { calls.push(force); return force ? 'new' : 'old'; }), drop: vi.fn(async () => {}) };
  return { auth: auth as unknown as _DriveAuth, raw: auth, calls };
};
const file = (id: string, name: string) => ({ id, name, mimeType: 'application/pdf', sha256Checksum: 'h' + id, createdTime: '2026-01-01T00:00:00Z' });
const urlOf = (f: ReturnType<typeof stub>, i: number) => new URL(String(f.mock.calls[i][0]));

afterEach(() => vi.unstubAllGlobals());

describe('_httpDriveApi', () => {
  it('follows two pages of children', async () => {
    const f = stub(reply({ files: [file('1', 'a.pdf')], nextPageToken: 'p2' }), reply({ files: [{ id: '2', name: 'Sub', mimeType: 'application/vnd.google-apps.folder', createdTime: 't' }] }));
    const out = await _httpDriveApi(fakeAuth().auth).children('root');
    expect(out.map((i) => [i.id, i.folder, i.sha256])).toEqual([['1', false, 'h1'], ['2', true, undefined]]);
    expect(urlOf(f, 0).searchParams.get('q')).toBe("'root' in parents and trashed=false");
    expect(urlOf(f, 1).searchParams.get('pageToken')).toBe('p2');
  });

  it('escapes a quote and a backslash in a name', async () => {
    const f = stub(reply({ files: [] }));
    await _httpDriveApi(fakeAuth().auth).named('d', "It's a\\b.pdf");
    expect(urlOf(f, 0).searchParams.get('q')).toBe("'d' in parents and trashed=false and name='It\\'s a\\\\b.pdf'");
  });

  it('retries once with a forced token after a 401', async () => {
    const f = stub(reply({}, 401), reply({ files: [] }));
    const { auth, calls } = fakeAuth();
    await _httpDriveApi(auth).children('d');
    expect(calls).toEqual([false, true]);
    expect(f).toHaveBeenCalledTimes(2);
    expect((f.mock.calls[1][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer new' });
  });

  it('is NoAccess, signed out, after two 401s', async () => {
    stub(reply({}, 401), reply({}, 401));
    const { auth, raw } = fakeAuth();
    await expect(_httpDriveApi(auth).children('d')).rejects.toBeInstanceOf(NoAccess);
    expect(raw.drop).toHaveBeenCalled();
  });

  it('is Unreachable when fetch rejects', async () => {
    stub(new TypeError('Failed to fetch'));
    await expect(_httpDriveApi(fakeAuth().auth).download('x')).rejects.toBeInstanceOf(Unreachable);
  });

  it('throws other failures with the status and message', async () => {
    stub(reply({ error: { message: 'Rate limit' } }, 403));
    await expect(_httpDriveApi(fakeAuth().auth).trash('x')).rejects.toThrow('403 Rate limit');
  });

  it('moves a file between folders with addParents and removeParents', async () => {
    const f = stub(reply({}));
    await _httpDriveApi(fakeAuth().auth).update('f1', { name: 'b.pdf', fromFolder: 'A', toFolder: 'B' });
    const u = urlOf(f, 0);
    expect(u.searchParams.get('addParents')).toBe('B');
    expect(u.searchParams.get('removeParents')).toBe('A');
    expect((f.mock.calls[0][1] as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ name: 'b.pdf' });
  });
});
