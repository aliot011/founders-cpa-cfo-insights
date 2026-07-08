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

/**
 * Deep link to the transaction in QuickBooks Online, or null when the type
 * has no known edit URL. Opens in the browser's current QBO session, so the
 * user must be signed into (or switch to) the same company.
 */
export function qboTxnUrl(
  environment: 'sandbox' | 'production',
  entry: Pick<LedgerEntry, 'transactionType' | 'txnId'>,
): string | null {
  if (!entry.txnId) return null;
  const slug = slugFor(entry.transactionType);
  if (!slug) return null;
  const host = environment === 'production' ? 'app.qbo.intuit.com' : 'app.sandbox.qbo.intuit.com';
  return `https://${host}/app/${slug}?txnId=${encodeURIComponent(entry.txnId)}`;
}
