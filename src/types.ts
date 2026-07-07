// Core domain types for the CFO insights tool.

/** A category we bucket every GL account into. Drives all P&L / BS math. */
export type Category =
  | 'revenue'
  | 'cogs'
  | 'opex'
  | 'other_income'
  | 'other_expense'
  | 'cash'
  | 'asset'
  | 'liability_equity'
  | 'ignore';

export const CATEGORY_LABELS: Record<Category, string> = {
  revenue: 'Revenue',
  cogs: 'Cost of Goods Sold',
  opex: 'Operating Expenses',
  other_income: 'Other Income',
  other_expense: 'Other Expense',
  cash: 'Cash / Bank',
  asset: 'Other Asset (Balance Sheet)',
  liability_equity: 'Liability / Equity (Balance Sheet)',
  ignore: 'Ignore (exclude entirely)',
};

/** Every category, in a stable order. */
export const ALL_CATEGORIES: Category[] = [
  'revenue', 'cogs', 'opex', 'other_income', 'other_expense',
  'cash', 'asset', 'liability_equity', 'ignore',
];

/** Profit & Loss categories (flows). */
export const PNL_CATEGORIES: Category[] = [
  'revenue', 'cogs', 'opex', 'other_income', 'other_expense',
];

/** Balance-sheet categories (stocks / balances). */
export const BS_CATEGORIES: Category[] = ['cash', 'asset', 'liability_equity'];

/** One normalized general-ledger transaction line. */
export interface LedgerEntry {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Month bucket key (YYYY-MM). */
  month: string;
  account: string;
  /** Debit-positive signed amount (debit − credit). */
  amount: number;
  name?: string;
  vendor?: string;
  customer?: string;
  memo?: string;
  transactionType?: string;
}

/** account name -> category. User-editable, persisted. */
export type AccountMap = Record<string, Category>;

/** Result of parsing an uploaded file. */
export interface ParseResult {
  entries: LedgerEntry[];
  accounts: string[];
  /** Non-fatal notes surfaced to the user (skipped rows, sign detection, etc.). */
  notes: string[];
  fileName: string;
}

/** The full persisted dataset. */
export interface Dataset {
  entries: LedgerEntry[];
  accountMap: AccountMap;
  fileName: string;
  importedAt: string;
  notes: string[];
}

/** Every metric we compute per month. */
export interface MonthlyMetrics {
  month: string; // YYYY-MM
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number; // fraction 0..1
  opex: number;
  operatingProfit: number; // Net Operating Profit
  operatingMargin: number; // fraction
  otherIncome: number;
  otherExpense: number;
  otherNet: number; // OI − OE  ("OI/OE")
  netIncome: number;
  netIncomeMargin: number; // fraction
  cash: number; // ending cash balance
}

export type MetricKey =
  | 'revenue'
  | 'cogs'
  | 'grossProfit'
  | 'grossMargin'
  | 'opex'
  | 'operatingProfit'
  | 'operatingMargin'
  | 'otherNet'
  | 'netIncome'
  | 'netIncomeMargin'
  | 'cash';

export interface MetricDef {
  key: MetricKey;
  label: string;
  /** 'currency' | 'percent' */
  format: 'currency' | 'percent';
  /** Short description shown on hover/help. */
  help: string;
}

export const METRIC_DEFS: MetricDef[] = [
  { key: 'revenue', label: 'Revenue', format: 'currency', help: 'Total income from revenue accounts.' },
  { key: 'cogs', label: 'Cost of Goods Sold', format: 'currency', help: 'Total cost of goods sold.' },
  { key: 'grossProfit', label: 'Gross Profit', format: 'currency', help: 'Revenue − COGS.' },
  { key: 'grossMargin', label: 'Gross Margin', format: 'percent', help: 'Gross Profit ÷ Revenue.' },
  { key: 'opex', label: 'Operating Expenses', format: 'currency', help: 'Total operating expenses.' },
  { key: 'operatingProfit', label: 'Net Operating Profit', format: 'currency', help: 'Gross Profit − Operating Expenses.' },
  { key: 'operatingMargin', label: 'Net Operating Margin', format: 'percent', help: 'Operating Profit ÷ Revenue.' },
  { key: 'otherNet', label: 'Other Income / (Expense)', format: 'currency', help: 'Non-operating: Other Income − Other Expense.' },
  { key: 'netIncome', label: 'Net Income', format: 'currency', help: 'Operating Profit + Other Income − Other Expense.' },
  { key: 'netIncomeMargin', label: 'Net Income Margin', format: 'percent', help: 'Net Income ÷ Revenue.' },
  { key: 'cash', label: 'Cash', format: 'currency', help: 'Ending cash balance across cash/bank accounts.' },
];
