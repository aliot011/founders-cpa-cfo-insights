import { env } from '../env.ts';
import { ApiError } from '../errors.ts';
import { getConnection, markNeedsReauth, saveTokens, type ConnectionRow } from '../db.ts';
import { refreshTokens } from './oauth.ts';

const BASE_URL =
  env.QBO_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';

const MINOR_VERSION = '75';

// Refresh a little early so a token doesn't expire mid-request.
const EXPIRY_MARGIN_MS = 2 * 60 * 1000;

// Serialize refreshes per realm: a concurrent second refresh would send the
// already-rotated (now invalid) refresh token and kill the connection.
const inflightRefresh = new Map<string, Promise<void>>();

function requireConnection(realmId: string): ConnectionRow {
  const conn = getConnection(realmId);
  if (!conn) throw new ApiError(404, `No QuickBooks connection for realm ${realmId}`, 'not_found');
  if (conn.status === 'needs_reauth') {
    throw new ApiError(401, `${conn.company_name} needs to be reconnected to QuickBooks.`, 'needs_reauth');
  }
  return conn;
}

async function refreshConnection(realmId: string): Promise<void> {
  let promise = inflightRefresh.get(realmId);
  if (!promise) {
    promise = (async () => {
      const conn = getConnection(realmId);
      if (!conn) throw new ApiError(404, `No QuickBooks connection for realm ${realmId}`, 'not_found');
      try {
        const tokens = await refreshTokens(conn.refresh_token);
        saveTokens(realmId, tokens); // persists the ROTATED refresh token
      } catch (err) {
        if ((err as { invalidGrant?: boolean }).invalidGrant) {
          markNeedsReauth(realmId);
          throw new ApiError(
            401,
            `${conn.company_name}'s QuickBooks authorization has expired. Reconnect the company to continue syncing.`,
            'needs_reauth',
          );
        }
        throw err;
      }
    })().finally(() => inflightRefresh.delete(realmId));
    inflightRefresh.set(realmId, promise);
  }
  return promise;
}

async function accessTokenFor(realmId: string): Promise<string> {
  let conn = requireConnection(realmId);
  if (new Date(conn.access_token_expires_at).getTime() - Date.now() < EXPIRY_MARGIN_MS) {
    await refreshConnection(realmId);
    conn = requireConnection(realmId);
  }
  return conn.access_token;
}

/**
 * Authenticated GET against the QBO v3 API for one realm. Handles base URL,
 * minorversion, proactive token refresh, and one refresh-and-retry on 401.
 */
export async function qboFetch<T>(realmId: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}/v3/company/${realmId}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('minorversion', MINOR_VERSION);

  const attempt = async (token: string) =>
    fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });

  let res = await attempt(await accessTokenFor(realmId));
  if (res.status === 401) {
    await refreshConnection(realmId);
    res = await attempt(await accessTokenFor(realmId));
  }

  const text = await res.text();
  if (!res.ok) {
    const summary = text.length > 500 ? text.slice(0, 500) + '…' : text;
    throw new ApiError(502, `QuickBooks API ${res.status} on ${path}: ${summary}`, 'qbo_error');
  }
  return JSON.parse(text) as T;
}

/** Escape a string literal for a QBO SQL-ish query. */
export function qboQuote(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}
