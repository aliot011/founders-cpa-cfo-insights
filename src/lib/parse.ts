import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { LedgerEntry, ParseResult } from '../types';

/** Read any supported file into a raw string matrix (rows of cells). */
export async function fileToMatrix(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      dateNF: 'yyyy-mm-dd',
      defval: '',
    });
    return rows.map((r) => r.map((c) => (c == null ? '' : String(c))));
  }
  // CSV (default)
  const text = await file.text();
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  return (parsed.data as string[][]).map((r) => r.map((c) => (c == null ? '' : String(c))));
}

// ---- Column detection -------------------------------------------------------

interface ColMap {
  date: number;
  account: number;
  amount: number;
  debit: number;
  credit: number;
  balance: number;
  name: number;
  vendor: number;
  customer: number;
  memo: number;
  type: number;
  split: number;
}

const HEADER_PATTERNS: Record<keyof ColMap, RegExp> = {
  date: /^date$/i,
  account: /^account/i,
  amount: /^amount$/i,
  debit: /^debit$/i,
  credit: /^credit$/i,
  balance: /^balance$/i,
  name: /^(name|payee|customer|vendor)/i,
  vendor: /^vendor/i,
  customer: /^customer/i,
  memo: /^(memo|description|memo\/description)/i,
  type: /^(transaction type|type)/i,
  split: /^split/i,
};

function detectHeaderRow(matrix: string[][]): { index: number; cols: ColMap } | null {
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const row = matrix[i].map((c) => c.trim());
    const hasDate = row.some((c) => /^date$/i.test(c));
    const hasValue = row.some((c) => /^(amount|debit|credit)$/i.test(c));
    if (hasDate && hasValue) {
      const cols: ColMap = {
        date: -1, account: -1, amount: -1, debit: -1, credit: -1,
        balance: -1, name: -1, vendor: -1, customer: -1, memo: -1, type: -1, split: -1,
      };
      (Object.keys(HEADER_PATTERNS) as (keyof ColMap)[]).forEach((key) => {
        const idx = row.findIndex((c) => HEADER_PATTERNS[key].test(c));
        if (idx >= 0) cols[key] = idx;
      });
      return { index: i, cols };
    }
  }
  return null;
}

// ---- Value parsing ----------------------------------------------------------

/** Parse "$1,234.50", "(500.00)", "1234" into a number. Blank -> null. */
function parseNumber(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[()$,\s]/g, '').replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  if (!isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

/** Parse a date cell into YYYY-MM-DD, or null. */
function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Already ISO-ish
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  // MM/DD/YYYY or M/D/YY
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (us) {
    let year = Number(us[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return `${year}-${pad(us[1])}-${pad(us[2])}`;
  }
  // Excel serial number (e.g. 46073). Some xlsx exports store dates as numbers.
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial >= 20000 && serial <= 80000) {
      // Excel epoch is 1899-12-30 (accounts for the 1900 leap-year bug).
      const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
      const d = new Date(ms);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
  }
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return null;
}

function pad(v: string | number): string {
  return String(v).padStart(2, '0');
}

const SKIP_PREFIXES = /^(total|beginning balance|ending balance|net (income|change)|gross)/i;

// ---- Main normalizer --------------------------------------------------------

export async function parseFile(file: File): Promise<ParseResult> {
  const matrix = await fileToMatrix(file);
  const notes: string[] = [];
  const header = detectHeaderRow(matrix);

  if (!header) {
    throw new Error(
      'Could not find a header row with "Date" and "Amount" (or Debit/Credit) columns. ' +
        'Export the report as a QuickBooks General Ledger to CSV or Excel and try again.',
    );
  }

  const { cols } = header;
  const useDrCr = cols.debit >= 0 && cols.credit >= 0;
  const flatAccount = cols.account >= 0;
  const entries: LedgerEntry[] = [];
  const accountsSet = new Set<string>();
  let currentAccount = '';
  let skipped = 0;

  for (let i = header.index + 1; i < matrix.length; i++) {
    const row = matrix[i];
    const cell = (idx: number) => (idx >= 0 && idx < row.length ? row[idx].trim() : '');

    const dateStr = cell(cols.date);
    const parsedDate = parseDate(dateStr);
    const amountCell = cell(cols.amount);
    const debit = useDrCr ? parseNumber(cell(cols.debit)) : null;
    const credit = useDrCr ? parseNumber(cell(cols.credit)) : null;
    const amountNum = useDrCr ? null : parseNumber(amountCell);

    const firstText = row.map((c) => c.trim()).find((c) => c !== '') ?? '';

    // Grouped-report account header: no date, no money, but has a label.
    const hasMoney = debit != null || credit != null || amountNum != null;
    if (!parsedDate && !hasMoney) {
      if (firstText && !SKIP_PREFIXES.test(firstText)) {
        currentAccount = firstText;
      }
      continue;
    }

    // Total / balance summary lines.
    if (SKIP_PREFIXES.test(firstText) && !parsedDate) {
      continue;
    }

    const account = flatAccount && cell(cols.account) ? cell(cols.account) : currentAccount;
    if (!account) {
      skipped++;
      continue;
    }

    let amount: number;
    if (useDrCr) {
      amount = (debit ?? 0) - (credit ?? 0);
    } else if (amountNum != null) {
      amount = amountNum;
    } else {
      skipped++;
      continue;
    }

    if (!parsedDate) {
      skipped++;
      continue;
    }

    accountsSet.add(account);
    entries.push({
      date: parsedDate,
      month: parsedDate.slice(0, 7),
      account,
      amount,
      name: cell(cols.name) || undefined,
      vendor: cell(cols.vendor) || undefined,
      customer: cell(cols.customer) || undefined,
      memo: cell(cols.memo) || undefined,
      transactionType: cell(cols.type) || undefined,
    });
  }

  if (entries.length === 0) {
    throw new Error('No transaction rows were found after the header. Please check the export format.');
  }

  notes.push(`Parsed ${entries.length.toLocaleString()} transactions across ${accountsSet.size} accounts.`);
  notes.push(useDrCr ? 'Used Debit/Credit columns (debit-positive).' : 'Used a single signed Amount column.');
  if (cols.vendor >= 0 || cols.customer >= 0) {
    notes.push('Detected Vendor/Customer columns — Vendor Spend will use them.');
  }
  if (skipped > 0) notes.push(`Skipped ${skipped} row(s) that had no account or no usable date/amount.`);

  return {
    entries,
    accounts: [...accountsSet].sort((a, b) => a.localeCompare(b)),
    notes,
    fileName: file.name,
  };
}
