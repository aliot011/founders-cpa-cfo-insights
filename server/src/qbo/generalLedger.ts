import type { AccountingMethod, LedgerEntry } from '../../../src/types.ts';
import { qboFetch } from './client.ts';
import type { GeneralLedgerReport, ReportColumn, ReportRow } from './types.ts';

// All values below are from the documented supported `columns=` list for the
// GeneralLedger report. `subt_nat_amount` must be requested explicitly — the
// API returns no amount column otherwise. It is the natural-sign amount;
// `computeCategorySigns()` in src/lib/metrics.ts normalizes per-category
// signs downstream, so it is used as-is. `rbal_nat_amount` (running balance)
// is what carries the value on Beginning Balance rows.
const REPORT_COLUMNS = 'account_name,tx_date,txn_type,name,memo,vend_name,cust_name,subt_nat_amount,rbal_nat_amount';

export interface TransformResult {
  entries: LedgerEntry[];
  /**
   * Per-account balance as of the report's start date, from the Beginning
   * Balance rows (balance-sheet accounts only, natural sign).
   */
  openingBalances: Record<string, number>;
  /** Rows without a usable date/amount (beginning balances etc.). */
  skipped: number;
}

interface ColumnIndex {
  account: number;
  date: number;
  txnType: number;
  name: number;
  memo: number;
  vendor: number;
  customer: number;
  amount: number;
  balance: number;
}

/**
 * The stable key for a report column. The live API identifies columns via
 * MetaData ColKey (ColType is just the generic Date/String/Money); older
 * shapes carried the key in ColType, kept as a fallback.
 */
function colKey(column: ReportColumn): string | undefined {
  return column.MetaData?.find((m) => m.Name === 'ColKey')?.Value ?? column.ColType;
}

/**
 * Index columns from the response's own metadata — never by position. The
 * column set and order drift with the request and company features (classes,
 * locations, sales tax).
 */
function indexColumns(report: GeneralLedgerReport): ColumnIndex {
  const columns = report.Columns?.Column ?? [];
  const find = (key: string) => columns.findIndex((c) => colKey(c) === key);
  return {
    account: find('account_name'),
    date: find('tx_date'),
    txnType: find('txn_type'),
    name: find('name'),
    memo: find('memo'),
    vendor: find('vend_name'),
    customer: find('cust_name'),
    amount: find('subt_nat_amount'),
    balance: find('rbal_nat_amount'),
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Flatten a GeneralLedger report into LedgerEntry rows.
 *
 * Walks every nested row collecting `type: "Data"` rows only — Intuit
 * documents the section hierarchy as broken for some sub-account setups, so
 * nesting is never trusted for the account: each Data row's own account_name
 * column carries the fully-qualified "Parent:Sub" path, with the nearest
 * section header as fallback. Summary rows are excluded (double-count hazard).
 */
export function transformReport(report: GeneralLedgerReport): TransformResult {
  const rootRows = report.Rows?.Row ?? [];
  if (rootRows.length === 0) return { entries: [], openingBalances: {}, skipped: 0 };

  const cols = indexColumns(report);
  if (cols.date < 0 || cols.amount < 0) {
    // Fail loudly: silently skipping every row reads as "synced 0 transactions".
    const got = (report.Columns?.Column ?? []).map((c) => colKey(c) ?? '?').join(', ');
    throw new Error(`GeneralLedger response lacks tx_date/subt_nat_amount columns (got: ${got || 'none'}).`);
  }

  const entries: LedgerEntry[] = [];
  const openingBalances: Record<string, number> = {};
  let skipped = 0;

  const cell = (row: ReportRow, idx: number): string => {
    if (idx < 0) return '';
    return row.ColData?.[idx]?.value?.trim() ?? '';
  };

  const walk = (rows: ReportRow[] | undefined, sectionAccount: string) => {
    for (const row of rows ?? []) {
      if (row.type === 'Data' && row.ColData) {
        const date = cell(row, cols.date);
        const rawAmount = cell(row, cols.amount).replace(/,/g, '');
        const amount = rawAmount === '' ? NaN : Number(rawAmount);
        const account = cell(row, cols.account) || sectionAccount;
        // Beginning Balance and similar summary-ish data rows have no date.
        if (!DATE_RE.test(date) || !isFinite(amount) || !account) {
          // Beginning Balance rows carry the account's balance as of the
          // report start in the running-balance column (account name only in
          // the enclosing section header).
          const rawBalance = cell(row, cols.balance).replace(/,/g, '');
          if (/^beginning balance$/i.test(date) && account && rawBalance !== '' && isFinite(Number(rawBalance))) {
            openingBalances[account] = (openingBalances[account] ?? 0) + Number(rawBalance);
          }
          skipped++;
          continue;
        }
        entries.push({
          date,
          month: date.slice(0, 7),
          account,
          amount,
          name: cell(row, cols.name) || undefined,
          vendor: cell(row, cols.vendor) || undefined,
          customer: cell(row, cols.customer) || undefined,
          memo: cell(row, cols.memo) || undefined,
          transactionType: cell(row, cols.txnType) || undefined,
        });
        continue;
      }
      // Section (or untyped container): recurse with this section's account
      // path (headers carry short names, so nesting builds "Parent:Sub").
      const header = row.Header?.ColData?.[0]?.value?.trim();
      const path = header ? (sectionAccount ? `${sectionAccount}:${header}` : header) : sectionAccount;
      walk(row.Rows?.Row, path);
    }
  };

  walk(report.Rows?.Row, '');
  return { entries, openingBalances, skipped };
}

function isEmptyReport(report: GeneralLedgerReport): boolean {
  return report.Header?.Option?.some((o) => o.Name === 'NoReportData' && o.Value === 'true') ?? false;
}

/** Calendar-year chunks covering [startDate, endDate] — the report API has no pagination. */
export function yearChunks(startDate: string, endDate: string): { start: string; end: string }[] {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const chunks: { start: string; end: string }[] = [];
  for (let year = startYear; year <= endYear; year++) {
    chunks.push({
      start: year === startYear ? startDate : `${year}-01-01`,
      end: year === endYear ? endDate : `${year}-12-31`,
    });
  }
  return chunks;
}

export async function fetchGeneralLedger(
  realmId: string,
  startDate: string,
  endDate: string,
  accountingMethod: AccountingMethod = 'Accrual',
): Promise<TransformResult> {
  const entries: LedgerEntry[] = [];
  const openingBalances: Record<string, number> = {};
  let skipped = 0;
  let haveOpenings = false;
  for (const chunk of yearChunks(startDate, endDate)) {
    const report = await qboFetch<GeneralLedgerReport>(realmId, '/reports/GeneralLedger', {
      start_date: chunk.start,
      end_date: chunk.end,
      accounting_method: accountingMethod,
      columns: REPORT_COLUMNS,
    });
    if (isEmptyReport(report)) continue;
    const result = transformReport(report);
    entries.push(...result.entries);
    skipped += result.skipped;
    // Openings come from the first chunk that has data: its Beginning Balance
    // is the balance as of that chunk's start, and no earlier chunk
    // contributed entries, so the cumulative math stays exact.
    if (!haveOpenings) {
      Object.assign(openingBalances, result.openingBalances);
      haveOpenings = true;
    }
  }
  return { entries, openingBalances, skipped };
}
