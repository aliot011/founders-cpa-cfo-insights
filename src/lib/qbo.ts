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
 * Deep link to the transaction in QuickBooks Online, or null when the type
 * has no known edit URL.
 *
 * Routed through the switchCompany endpoint with a chained destination so
 * the session is forced onto the right company first. If QBO honors the
 * destination param the user lands on the transaction; if it ignores it,
 * they land on the right company's homepage — never in the wrong books.
 */
export function qboTxnUrl(
  environment: 'sandbox' | 'production',
  realmId: string,
  entry: Pick<LedgerEntry, 'transactionType' | 'txnId'>,
): string | null {
  if (!entry.txnId) return null;
  const slug = slugFor(entry.transactionType);
  if (!slug) return null;
  const destination = encodeURIComponent(`/app/${slug}?txnId=${entry.txnId}`);
  return `https://${hostFor(environment)}/app/switchCompany?companyId=${encodeURIComponent(realmId)}&destination=${destination}`;
}

/**
 * Point the browser's QBO session at this company. Lands on the QBO homepage;
 * after that, every transaction link is guaranteed to open in the right books.
 */
export function qboSwitchUrl(environment: 'sandbox' | 'production', realmId: string): string {
  return `https://${hostFor(environment)}/app/switchCompany?companyId=${encodeURIComponent(realmId)}`;
}
