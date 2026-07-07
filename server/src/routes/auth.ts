import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { getConnection, updateCompanyInfo, upsertConnection } from '../db.ts';
import { buildAuthUrl, exchangeCode } from '../qbo/oauth.ts';
import { qboFetch } from '../qbo/client.ts';
import type { QboCompanyInfo } from '../qbo/types.ts';

const STATE_COOKIE = 'qbo_oauth_state';

export const authRouter = Router();

authRouter.get('/connect', (_req, res) => {
  const state = randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  res.redirect(buildAuthUrl(state));
});

authRouter.get('/callback', async (req, res) => {
  const fail = (reason: string) => res.redirect(`/?connect_error=${encodeURIComponent(reason)}`);
  try {
    const { code, state, realmId, error } = req.query as Record<string, string | undefined>;
    if (error) return fail(error);
    if (!code || !realmId) return fail('QuickBooks did not return an authorization code.');
    if (!state || state !== req.cookies?.[STATE_COOKIE]) return fail('OAuth state mismatch — please try connecting again.');
    res.clearCookie(STATE_COOKIE);

    const tokens = await exchangeCode(code);
    // Store tokens first (keeping any prior name on reconnect), then let
    // qboFetch use them to look up the company details.
    const prior = getConnection(realmId);
    upsertConnection({
      realmId,
      companyName: prior?.company_name ?? `Company ${realmId}`,
      tokens,
      companyStartDate: prior?.company_start_date ?? null,
    });
    const info = await qboFetch<{ CompanyInfo: QboCompanyInfo }>(realmId, `/companyinfo/${realmId}`);
    updateCompanyInfo(realmId, info.CompanyInfo.CompanyName, info.CompanyInfo.CompanyStartDate ?? null);

    res.redirect(`/?client=${encodeURIComponent(realmId)}&connected=1`);
  } catch (err) {
    console.error('OAuth callback failed:', err);
    fail(err instanceof Error ? err.message : 'Connection failed.');
  }
});
