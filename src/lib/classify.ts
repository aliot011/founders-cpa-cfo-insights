import type { Category } from '../types';

/**
 * Best-effort classification of a QuickBooks account name into a P&L / cash
 * category. This is heuristic — the UI lets the user override every mapping.
 *
 * Two signals are used:
 *  1. A leading account number (common in QuickBooks charts of accounts).
 *  2. Keyword matching on the account name.
 */
export function guessCategory(rawAccount: string): Category {
  const account = rawAccount.trim();
  const lower = account.toLowerCase();

  // --- 1. Account-number prefix (e.g. "4000 · Sales", "50100 Cost of Sales")
  const numMatch = account.match(/^(\d{4,6})/);
  if (numMatch) {
    const lead = Number(numMatch[1][0]); // first digit of the account number
    // Common numbering: 1=assets, 4=income, 5=cogs, 6/7/8=expense
    if (lead === 5) return 'cogs';
    if (lead === 4) return byIncomeKeywords(lower, 'revenue');
    if (lead === 6 || lead === 7 || lead === 8) return byExpenseKeywords(lower, 'opex');
    if (lead === 1 && isCashName(lower)) return 'cash';
  }

  // --- 2. Keyword matching
  if (isCashName(lower)) return 'cash';

  if (/(cost of goods|cost of sales|cost of revenue|\bcogs\b|\bcos\b|direct cost|direct labor|direct material|merchant fees|processing fees)/.test(lower)) {
    return 'cogs';
  }

  if (/(interest income|dividend|gain on|unrealized gain|other income|misc(ellaneous)? income|realized gain)/.test(lower)) {
    return 'other_income';
  }
  if (/(interest expense|loss on|other expense|amortization|depreciation|income tax|tax expense|penalt)/.test(lower)) {
    return 'other_expense';
  }

  if (/(revenue|sales|income|fees earned|service charge|billings)/.test(lower)) {
    return 'revenue';
  }

  if (
    /(expense|payroll|salaries|wages|rent|utilities|marketing|advertis|insurance|supplies|software|subscription|travel|meals|office|professional|legal|accounting|bank charge|dues|repairs|maintenance|telephone|internet|shipping|freight|commission|contractor|benefits)/.test(
      lower,
    )
  ) {
    return 'opex';
  }

  return 'ignore';
}

function isCashName(lower: string): boolean {
  return /(cash|checking|savings|\bbank\b|money market|petty cash|operating account|deposit account)/.test(lower);
}

function byIncomeKeywords(lower: string, fallback: Category): Category {
  if (/(interest|dividend|gain|other income)/.test(lower)) return 'other_income';
  return fallback;
}

function byExpenseKeywords(lower: string, fallback: Category): Category {
  // Name signals win over the number-range guess.
  if (/(interest income|dividend|\bgain\b|other income)/.test(lower)) return 'other_income';
  if (/(interest expense|income tax|tax expense|depreciation|amortization|loss on|other expense)/.test(lower)) {
    return 'other_expense';
  }
  return fallback;
}

/** Build a mapping for a fresh set of accounts. */
export function buildAccountMap(accounts: string[]): Record<string, Category> {
  const map: Record<string, Category> = {};
  for (const a of accounts) map[a] = guessCategory(a);
  return map;
}
