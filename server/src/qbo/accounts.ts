import type { AccountMap, Category } from '../../../src/types.ts';
import { guessCategory } from '../../../src/lib/classify.ts';
import { qboFetch } from './client.ts';
import type { QboAccount } from './types.ts';

/** QBO AccountType → app Category. Anything unlisted falls back to name heuristics. */
const ACCOUNT_TYPE_CATEGORY: Record<string, Category> = {
  Income: 'revenue',
  'Cost of Goods Sold': 'cogs',
  Expense: 'opex',
  'Other Income': 'other_income',
  'Other Expense': 'other_expense',
  Bank: 'cash',
  'Accounts Receivable': 'asset',
  'Other Current Asset': 'asset',
  'Fixed Asset': 'asset',
  'Other Asset': 'asset',
  'Accounts Payable': 'liability_equity',
  'Credit Card': 'liability_equity',
  'Other Current Liability': 'liability_equity',
  'Long Term Liability': 'liability_equity',
  Equity: 'liability_equity',
};

interface AccountQueryResponse {
  QueryResponse: { Account?: QboAccount[] };
}

const PAGE_SIZE = 1000;

export async function fetchAllAccounts(realmId: string): Promise<QboAccount[]> {
  const accounts: QboAccount[] = [];
  for (let start = 1; ; start += PAGE_SIZE) {
    const res = await qboFetch<AccountQueryResponse>(realmId, '/query', {
      query: `SELECT * FROM Account STARTPOSITION ${start} MAXRESULTS ${PAGE_SIZE}`,
    });
    const page = res.QueryResponse.Account ?? [];
    accounts.push(...page);
    if (page.length < PAGE_SIZE) return accounts;
  }
}

export function categoryForAccount(account: QboAccount): Category {
  return ACCOUNT_TYPE_CATEGORY[account.AccountType] ?? guessCategory(account.FullyQualifiedName || account.Name);
}

/**
 * Category lookup keyed under both Name and FullyQualifiedName ("Parent:Sub"),
 * since GL report labels use the colon-joined path but short names appear too.
 */
export function buildQboAccountMap(accounts: QboAccount[]): AccountMap {
  const map: AccountMap = {};
  for (const a of accounts) {
    const category = categoryForAccount(a);
    if (a.FullyQualifiedName) map[a.FullyQualifiedName] = category;
    if (a.Name && !(a.Name in map)) map[a.Name] = category;
  }
  return map;
}
