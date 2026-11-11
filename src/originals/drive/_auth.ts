// Signing in to Google for the Drive root: the OAuth authorization code flow with PKCE (the pure
// parts: the authorization URL, the verifier and its challenge), and the tokens: the refresh token
// kept in storage, the access token in memory.

import { keys } from '../../storage/keys';
import { kv } from '../../storage/kv';
import { _clientId, _clientSecret } from './_config';
import { NoAccess, Unreachable } from '../types';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const SCOPE = 'https://www.googleapis.com/auth/drive';

/** Where the refresh token is kept: the kv store, or a stand-in in tests. */
export interface _AuthStore { get(): Promise<string | undefined>; set(token: string): Promise<void>; del(): Promise<void> }

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The authorization URL, for the verifier's S256 challenge, `state`, the drive scope, offline access and consent. Pure. */
export function _authUrl(o: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    code_challenge: o.challenge,
    code_challenge_method: 'S256',
    state: o.state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${AUTH}?${q}`;
}

/** base64url(SHA-256(verifier)). */
export async function _challenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

/** A random verifier (43 characters of the allowed set); `state` is made the same way. */
export function _newVerifier(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }

export class _DriveAuth {
  private access?: { token: string; until: number };

  constructor(private store: _AuthStore, private client: { id: string; secret: string }, private now: () => number = Date.now) {}

  /** Whether there is a refresh token. */
  async signedIn(): Promise<boolean> {
    return !!(await this.store.get());
  }

  /** POST a form to Google's token endpoint; a missing network is Unreachable. */
  private async post(fields: Record<string, string>): Promise<{ ok: boolean; json: TokenResponse }> {
    let res: Response;
    try {
      res = await fetch(TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: this.client.id, client_secret: this.client.secret, ...fields }),
      });
    } catch (e) {
      throw new Unreachable("Google Drive can't be reached.", { cause: e });
    }
    return { ok: res.ok, json: (await res.json().catch(() => ({}))) as TokenResponse };
  }

  private keep(json: TokenResponse) {
    if (json.access_token) this.access = { token: json.access_token, until: this.now() + (json.expires_in ?? 0) * 1000 };
  }

  /** Exchange `code` for tokens, storing the refresh token. Throws when Google refuses. */
  async exchange(code: string, verifier: string, redirectUri: string): Promise<void> {
    const { ok, json } = await this.post({ code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri });
    if (!ok || !json.access_token) throw new Error(`Google refused the sign-in: ${json.error ?? 'no token'} ${json.error_description ?? ''}`.trim());
    if (!json.refresh_token) throw new Error('Google gave no refresh token');
    this.keep(json);
    await this.store.set(json.refresh_token);
  }

  /**
   * An access token with a minute or more left, refreshed if need be (or `force`d). Throws NoAccess
   * when signed out (deleting the refresh token when Google refuses it: `invalid_grant`), and
   * Unreachable without a network.
   */
  async token(force = false): Promise<string> {
    if (!force && this.access && this.access.until - this.now() >= 60_000) return this.access.token;
    const refreshToken = await this.store.get();
    if (!refreshToken) throw new NoAccess('Not signed in to Google Drive.');
    const { ok, json } = await this.post({ refresh_token: refreshToken, grant_type: 'refresh_token' });
    if (!ok || !json.access_token) {
      if (json.error === 'invalid_grant') { await this.drop(); throw new NoAccess('Not signed in to Google Drive.'); }
      throw new Error(`Google refused a new token: ${json.error ?? 'no token'} ${json.error_description ?? ''}`.trim());
    }
    this.keep(json);
    return json.access_token;
  }

  /** Forget the sign-in here, without telling Google. */
  async drop(): Promise<void> {
    this.access = undefined;
    await this.store.del();
  }

  /** Revoke the refresh token with Google (failures ignored) and delete it. */
  async signOut(): Promise<void> {
    const token = await this.store.get();
    if (token) await fetch(`${REVOKE}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
    await this.drop();
  }
}

/** The app's: the refresh token under the kv key `drive-auth` ({ refreshToken }). */
export const _driveAuth = new _DriveAuth(
  {
    get: async () => (await kv.get<{ refreshToken: string }>(keys.driveAuth))?.refreshToken,
    set: (refreshToken) => kv.set(keys.driveAuth, { refreshToken }),
    del: () => kv.del(keys.driveAuth),
  },
  { id: _clientId, secret: _clientSecret },
);
