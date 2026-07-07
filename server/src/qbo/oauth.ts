import { env } from '../env.ts';
import type { TokenSet } from '../db.ts';
import type { TokenResponse } from './types.ts';

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';

function basicAuth(): string {
  return 'Basic ' + Buffer.from(`${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`).toString('base64');
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.QBO_CLIENT_ID,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: env.QBO_REDIRECT_URI,
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

function toTokenSet(res: TokenResponse): TokenSet {
  const now = Date.now();
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accessTokenExpiresAt: new Date(now + res.expires_in * 1000).toISOString(),
    refreshTokenExpiresAt: new Date(now + res.x_refresh_token_expires_in * 1000).toISOString(),
  };
}

async function tokenRequest(body: URLSearchParams): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Intuit token endpoint ${res.status}: ${text}`);
    (err as Error & { invalidGrant?: boolean }).invalidGrant = text.includes('invalid_grant');
    throw err;
  }
  return toTokenSet(JSON.parse(text) as TokenResponse);
}

export function exchangeCode(code: string): Promise<TokenSet> {
  return tokenRequest(
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env.QBO_REDIRECT_URI }),
  );
}

export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }));
}

/** Best-effort revoke on disconnect; failures are logged, not thrown. */
export async function revoke(refreshToken: string): Promise<void> {
  try {
    const res = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { Authorization: basicAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: refreshToken }),
    });
    if (!res.ok) console.warn(`Intuit revoke returned ${res.status}`);
  } catch (err) {
    console.warn('Intuit revoke failed:', err);
  }
}
