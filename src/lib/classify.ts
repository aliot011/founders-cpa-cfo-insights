import type { Category } from '../types';

/**
 * Best-effort classification of a QuickBooks account name into a P&L / cash /
 * balance-sheet category. This is heuristic — the UI lets the user override
 * every mapping.
 *
 * Strategy: try specific name keywords first (most reliable), then fall back to
 * a leading account-number prefix (common in QuickBooks charts of accounts).
 */
export function guessCategory(rawAccount: string): Category {
  const account = rawAccount.trim();
  const lower = account.toLowerCase();

  const byName = keywordCategory(lower);
  if (byName) return byName;

  // Account-number prefix fallback (e.g. "4000 Sales", "20100 A/P").
  const numMatch = account.match(/^(\d{3,6})/);
  if (numMatch) {
    const lead = Number(numMatch[1][0]);
    if (lead === 1) return 'asset'; // cash already handled by keyword
    if (lead === 2 || lead === 3) return 'liability_equity';
    if (lead === 4) return 'revenue';
    if (lead === 5) return 'cogs';
    if (lead === 6 || lead === 7 || lead === 8) return 'opex';
  }

  return 'ignore';
}

/** Confident keyword match, or null if nothing matches. Order is significant. */
function keywordCategory(lower: string): Category | null {
  if (isCashName(lower)) return 'cash';

  if (/(cost of goods|cost of sales|cost of revenue|\bcogs\b|\bcos\b|direct cost|direct labor|direct material|merchant fees|processing fees)/.test(lower)) {
    return 'cogs';
  }

  // Contra-assets must be caught before the depreciation/amortization expense rule.
  if (/(accumulated (depreciation|amortization))/.test(lower)) return 'asset';

  if (isAssetName(lower)) return 'asset';
  if (isLiabilityEquityName(lower)) return 'liability_equity';

  if (/(interest income|dividend|gain on|unrealized gain|realized gain|other income|misc(ellaneous)? income)/.test(lower)) {
    return 'other_income';
  }
  if (/(interest expense|loss on|other expense|amortization expense|depreciation expense|income tax|tax expense|penalt)/.test(lower)) {
    return 'other_expense';
  }

  if (/(revenue|sales|income|fees earned|service charge|billings|honorari)/.test(lower)) {
    return 'revenue';
  }

  if (
    /(expense|payroll|salaries|wages|\brent\b|utilities|marketing|advertis|insurance|supplies|software|subscription|travel|meals|office|professional|legal|accounting|bank charge|dues|repairs|maintenance|telephone|internet|shipping|freight|commission|contractor|benefits|depreciation)/.test(
      lower,
    )
  ) {
    return 'opex';
  }

  return null;
}

function isCashName(lower: string): boolean {
  return /(cash|checking|savings|\bbank\b|money market|petty cash|operating account|deposit account|undeposited funds)/.test(lower);
}

function isAssetName(lower: string): boolean {
  return /(receivable|\ba\/?r\b|inventory|prepaid|fixed asset|equipment|furniture|fixtures|vehicle|machinery|\bbuilding\b|\bland\b|leasehold|intangible|goodwill|right[- ]of[- ]use|work in progress|\bwip\b|security deposit|due from|other asset|current asset)/.test(
    lower,
  );
}

function isLiabilityEquityName(lower: string): boolean {
  return /(payable|\ba\/?p\b|credit card|\bloan\b|note[s]? payable|line of credit|accrued|deferred (revenue|income)|unearned|sales tax|payroll (tax|liabilit)|withhold|current portion|long[- ]term|mortgage|due to|\bequity\b|retained earnings|owner|capital|distribution|\bdraw(s|ing)?\b|common stock|preferred stock|paid[- ]in|treasury stock|partner|opening balance equity|member)/.test(
    lower,
  );
}

/** Build a mapping for a fresh set of accounts. */
export function buildAccountMap(accounts: string[]): Record<string, Category> {
  const map: Record<string, Category> = {};
  for (const a of accounts) map[a] = guessCategory(a);
  return map;
}
