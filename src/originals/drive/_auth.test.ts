import { afterEach, describe, expect, it, vi } from 'vitest';
import { _authUrl, _challenge, _DriveAuth, type _AuthStore } from './_auth';
import { NoAccess, Unreachable } from '../types';

const store = (initial?: string): _AuthStore & { value?: string } => {
  const s: _AuthStore & { value?: string } = { value: initial, get: async () => s.value, set: async (t) => { s.value = t; }, del: async () => { s.value = undefined; } };
  return s;
};
const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
const stub = (...answers: (Response | Error)[]) => {
  const f = vi.fn(async () => { const a = answers.shift()!; if (a instanceof Error) throw a; return a; });
  vi.stubGlobal('fetch', f);
  return f;
};
const client = { id: 'cid', secret: 'sec' };

afterEach(() => vi.unstubAllGlobals());

describe('_authUrl', () => {
  it('carries every parameter', () => {
    const u = new URL(_authUrl({ clientId: 'cid', redirectUri: 'https://x/volti/', challenge: 'ch', state: 'st' }));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const q = u.searchParams;
    expect(Object.fromEntries(q)).toEqual({
      client_id: 'cid', redirect_uri: 'https://x/volti/', response_type: 'code', scope: 'https://www.googleapis.com/auth/drive',
      code_challenge: 'ch', code_challenge_method: 'S256', state: 'st', access_type: 'offline', prompt: 'consent',
    });
  });
});

describe('_challenge', () => {
  it('is base64url(SHA-256(verifier)), no padding', async () => {
    // The expected value is from `openssl dgst -sha256 -binary | base64`, url-safe.
    expect(await _challenge('dBjftJeZ4CVP-mJ92IgdNa0qYDeJB6mJ3rcTNSV3qe4')).toBe('XrlOhxmhpThOY4nShhcuk0zk2QwvOjIZauKcJ9WcPO8');
  });
});

describe('_DriveAuth', () => {
  it('stores the refresh token on exchange, and sends the client and the verifier', async () => {
    const s = store();
    const f = stub(reply({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600 }));
    await new _DriveAuth(s, client).exchange('code', 'ver', 'https://x/');
    expect(s.value).toBe('r1');
    const body = new URLSearchParams(((f.mock.calls[0] as unknown[])[1] as RequestInit).body as URLSearchParams);
    expect(Object.fromEntries(body)).toMatchObject({ client_id: 'cid', client_secret: 'sec', code: 'code', code_verifier: 'ver', grant_type: 'authorization_code' });
  });

  it('throws when Google refuses the exchange', async () => {
    stub(reply({ error: 'invalid_request' }, 400));
    await expect(new _DriveAuth(store(), client).exchange('c', 'v', 'u')).rejects.toThrow('invalid_request');
  });

  it('reuses a fresh token, and refreshes one near expiry', async () => {
    let t = 0;
    const f = stub(reply({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600 }), reply({ access_token: 'a2', expires_in: 3600 }));
    const auth = new _DriveAuth(store(), client, () => t);
    await auth.exchange('c', 'v', 'u');
    expect(await auth.token()).toBe('a1');
    expect(f).toHaveBeenCalledTimes(1);
    t = 3600_000 - 30_000;
    expect(await auth.token()).toBe('a2');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('refreshes when forced', async () => {
    stub(reply({ access_token: 'a1', expires_in: 3600 }), reply({ access_token: 'a2', expires_in: 3600 }));
    const auth = new _DriveAuth(store('r'), client);
    expect(await auth.token()).toBe('a1');
    expect(await auth.token(true)).toBe('a2');
  });

  it('is NoAccess when signed out', async () => {
    const f = stub();
    const auth = new _DriveAuth(store(), client);
    expect(await auth.signedIn()).toBe(false);
    await expect(auth.token()).rejects.toBeInstanceOf(NoAccess);
    expect(f).not.toHaveBeenCalled();
  });

  it('deletes the refresh token on invalid_grant', async () => {
    const s = store('r');
    stub(reply({ error: 'invalid_grant' }, 400));
    await expect(new _DriveAuth(s, client).token()).rejects.toBeInstanceOf(NoAccess);
    expect(s.value).toBeUndefined();
  });

  it('is Unreachable when fetch rejects, and stays signed in', async () => {
    const s = store('r');
    stub(new TypeError('Failed to fetch'));
    await expect(new _DriveAuth(s, client).token()).rejects.toBeInstanceOf(Unreachable);
    expect(s.value).toBe('r');
  });

  it('revokes and deletes on sign out, even when revoking fails', async () => {
    const s = store('r');
    const f = stub(new TypeError('offline'));
    await new _DriveAuth(s, client).signOut();
    expect(s.value).toBeUndefined();
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('https://oauth2.googleapis.com/revoke?token=r');
  });
});
