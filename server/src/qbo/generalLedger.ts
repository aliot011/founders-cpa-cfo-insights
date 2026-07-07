import type { LedgerEntry } from '../../../src/types.ts';
import { qboFetch } from './client.ts';
import type { GeneralLedgerReport, ReportRow } from './types.ts';

// All values below are from the documented supported `columns=` list for the
// GeneralLedger report. The amount comes back as the default natural-sign
// `subt_nat_amount` column; `computeCategorySigns()` in src/lib/metrics.ts
// normalizes per-category signs downstream, so it is used as-is.
const REPORT_COLUMNS = 'account_name,tx_date,txn_type,name,memo,vend_name,cust_name';

export interface TransformResult {
  entries: LedgerEntry[];
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
}

/**
 * Index columns from the response's own metadata — never by position. The
 * column set drifts with company features (classes, locations, sales tax).
 */
function indexColumns(report: GeneralLedgerReport): ColumnIndex {
  const columns = report.Columns?.Column ?? [];
  const find = (type: string) => columns.findIndex((c) => c.ColType === type);
  return {
    account: find('account_name'),
    date: find('tx_date'),
    txnType: find('txn_type'),
    name: find('name'),
    memo: find('memo'),
    vendor: find('vend_name'),
    customer: find('cust_name'),
    amount: find('subt_nat_amount'),
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
  const cols = indexColumns(report);
  const entries: LedgerEntry[] = [];
  let skipped = 0;

  const cell = (row: ReportRow, idx: number): string => {
    if (idx < 0) return '';
    return row.ColData?.[idx]?.value?.trim() ?? '';
  };

  const walk = (rows: ReportRow[] | undefined, sectionAccount: string) => {
    for (const row of rows ?? []) {
      if (row.type === 'Data' && row.ColData) {
        const date = cell(row, cols.date);
        const rawAmount = cell(row, cols.amount >= 0 ? cols.amount : row.ColData.length - 1);
        const amount = rawAmount === '' ? NaN : Number(rawAmount);
        const account = cell(row, cols.account) || sectionAccount;
        // Beginning Balance and similar summary-ish data rows have no date.
        if (!DATE_RE.test(date) || !isFinite(amount) || !account) {
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
      // Section (or untyped container): recurse with this section's account label.
      const header = row.Header?.ColData?.[0]?.value?.trim();
      walk(row.Rows?.Row, header || sectionAccount);
    }
  };

  walk(report.Rows?.Row, '');
  return { entries, skipped };
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
): Promise<TransformResult> {
  const entries: LedgerEntry[] = [];
  let skipped = 0;
  for (const chunk of yearChunks(startDate, endDate)) {
    const report = await qboFetch<GeneralLedgerReport>(realmId, '/reports/GeneralLedger', {
      start_date: chunk.start,
      end_date: chunk.end,
      accounting_method: 'Accrual',
      columns: REPORT_COLUMNS,
    });
    if (isEmptyReport(report)) continue;
    const result = transformReport(report);
    entries.push(...result.entries);
    skipped += result.skipped;
  }
  return { entries, skipped };
}
