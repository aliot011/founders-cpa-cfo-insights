import type { LedgerEntry } from '../types.ts';

/** QBO transaction-type label -> app URL slug. */
const TYPE_SLUGS: Record<string, string> = {
  'journal entry': 'journal',
  expense: 'expense',
  'cash expense': 'expense',
  'credit card expense': 'expense',
  'credit card credit': 'creditcardcredit',
  check: 'check',
  bill: 'bill',
  'bill payment (check)': 'billpayment',
  'bill payment (credit card)': 'billpayment',
  'bill payment': 'billpayment',
  invoice: 'invoice',
  'sales receipt': 'salesreceipt',
  payment: 'recvpayment',
  'credit memo': 'creditmemo',
  refund: 'refundreceipt',
  deposit: 'deposit',
  transfer: 'transfer',
  'vendor credit': 'vendorcredit',
  'purchase order': 'purchaseorder',
  estimate: 'estimate',
};

function slugFor(transactionType: string | undefined): string | null {
  if (!transactionType) return null;
  const t = transactionType.toLowerCase();
  return TYPE_SLUGS[t] ?? (t.includes('journal') ? 'journal' : t.includes('expense') ? 'expense' : null);
}

function hostFor(environment: 'sandbox' | 'production'): string {
  return environment === 'production' ? 'app.qbo.intuit.com' : 'app.sandbox.qbo.intuit.com';
}

/**
 * The two URLs of the company-safe open flow, or null when the type has no
 * known edit URL. QBO's switchCompany endpoint flips the session onto the
 * right company but always lands on the homepage (it ignores destination
 * params — tested), so the caller opens `switchUrl` and then steers the same
 * tab to `txnUrl` a few seconds later. Even if that second hop never fires,
 * the tab is in the right company.
 */
export function qboTxnUrls(
  environment: 'sandbox' | 'production',
  realmId: string,
  entry: Pick<LedgerEntry, 'transactionType' | 'txnId'>,
): { switchUrl: string; txnUrl: string } | null {
  if (!entry.txnId) return null;
  const slug = slugFor(entry.transactionType);
  if (!slug) return null;
  return {
    switchUrl: qboSwitchUrl(environment, realmId),
    txnUrl: `https://${hostFor(environment)}/app/${slug}?txnId=${encodeURIComponent(entry.txnId)}`,
  };
}

/**
 * Point the browser's QBO session at this company. Lands on the QBO homepage;
 * after that, every transaction link is guaranteed to open in the right books.
 */
export function qboSwitchUrl(environment: 'sandbox' | 'production', realmId: string): string {
  return `https://${hostFor(environment)}/app/switchCompany?companyId=${encodeURIComponent(realmId)}`;
}

/** A vendor's profile page in QBO (same company-switch caveats as transactions). */
export function qboVendorUrl(environment: 'sandbox' | 'production', vendorId: string): string {
  return `https://${hostFor(environment)}/app/vendordetail?nameId=${encodeURIComponent(vendorId)}`;
}

/** How long the switchCompany hop gets before we steer the tab to the target. */
export const QBO_SWITCH_DELAY_MS = 5000;

/**
 * Open a QBO page company-safely: the tab starts on switchCompany (session
 * flips to the right company), then we steer the same tab to the target. A
 * cross-origin tab cannot be read, but a tab we opened can be navigated.
 * Worst case the tab rests on the right company's homepage.
 */
export function openInQbo(switchUrl: string, targetUrl: string): void {
  const w = window.open(switchUrl, '_blank');
  if (!w) return;
  window.setTimeout(() => {
    try {
      w.location.href = targetUrl;
    } catch {
      // Tab was closed — nothing to steer.
    }
  }, QBO_SWITCH_DELAY_MS);
}
