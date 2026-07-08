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
  /** QBO transaction id, enabling deep links into QuickBooks. */
  txnId?: string;
}

/** account name -> category. User-editable, persisted. */
export type AccountMap = Record<string, Category>;

/** QBO report basis used when pulling a client's General Ledger. */
export type AccountingMethod = 'Accrual' | 'Cash';

/** Access roles. Admins are advisors who can also manage users and companies. */
export type UserRole = 'admin' | 'advisor' | 'client';

/** An app user (the directory the future sign-in will authenticate against). */
export interface AppUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  /** For client users: the companies they can see. Empty for admins/advisors (they see all). */
  companies: { realmId: string; companyName: string }[];
  createdAt: string;
}

/** One connected QuickBooks company, as listed by the API. */
export interface ClientSummary {
  realmId: string;
  companyName: string;
  status: 'ok' | 'needs_reauth';
  connectedAt: string;
  lastSyncedAt: string | null;
  /** User override for where syncs start; null = full company history. */
  syncStartDate: string | null;
  companyStartDate: string | null;
  accountingMethod: AccountingMethod;
  /** Most recent closed month (YYYY-MM); reporting tabs stop here. Null = latest. */
  closedThrough: string | null;
}

/** A vendor's 1099/W-9-relevant profile fields (all the API exposes). */
export interface VendorProfile {
  id: string;
  name: string;
  /** QBO's "Track payments for 1099" checkbox. */
  tracked1099: boolean;
  /** A Tax ID is saved (the API returns it masked, so only presence is known). */
  hasTaxId: boolean;
  hasAddress: boolean;
  hasEmail: boolean;
}

/** A client's synced dataset, as served by the API. */
export interface ClientDataset {
  entries: LedgerEntry[];
  accountMap: AccountMap;
  /** Per-account balance as of startDate (natural sign), from QBO Beginning Balance rows. */
  openingBalances: Record<string, number>;
  /** Active vendor profiles (1099/W-9 fields) as of the last sync. */
  vendors: VendorProfile[];
  startDate: string;
  endDate: string;
  /** Non-fatal notes from the last sync (new accounts, skipped rows, etc.). */
  notes: string[];
  lastSyncedAt: string;
  companyName: string;
  /** Which QBO host transaction deep links should point at. */
  qboEnvironment: 'sandbox' | 'production';
}

/** Result of a completed sync. */
export interface SyncResult {
  lastSyncedAt: string;
  entryCount: number;
  accountCount: number;
  notes: string[];
}

/** One row of a client's sync history. */
export interface SyncLogEntry {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'error';
  entryCount: number | null;
  message: string | null;
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
