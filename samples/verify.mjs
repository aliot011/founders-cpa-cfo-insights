// Quick end-to-end sanity check of the parse -> classify -> metrics pipeline.
// Run with: npx tsx samples/verify.mjs [sample-file.csv]
import { readFileSync } from 'node:fs';
import { parseFile } from '../src/lib/parse.ts';
import { buildAccountMap } from '../src/lib/classify.ts';
import { computeMetrics, computeCategorySigns } from '../src/lib/metrics.ts';

const name = process.argv[2] ?? 'sample-general-ledger.csv';
const buf = readFileSync(new URL(`./${name}`, import.meta.url));
const file = new File([buf], name, { type: 'text/csv' });

const parsed = await parseFile(file);
console.log('NOTES:', parsed.notes);
console.log('ACCOUNTS:', parsed.accounts);

const map = buildAccountMap(parsed.accounts);
console.log('MAP:', map);

const metrics = computeMetrics(parsed.entries, map);
for (const m of metrics) {
  console.log(
    `${m.month}  rev=${m.revenue}  cogs=${m.cogs}  gp=${m.grossProfit}  gm=${(m.grossMargin * 100).toFixed(1)}%  ` +
      `opex=${m.opex}  nop=${m.operatingProfit}  otherNet=${m.otherNet}  ni=${m.netIncome}  cash=${m.cash}`,
  );
}

// Vendor-spend sanity: top payees across spend accounts, mirroring the Vendor Spend tab.
const SPEND = new Set(['cogs', 'opex', 'other_expense']);
const withVendor = parsed.entries.filter((e) => e.vendor || e.customer);
if (withVendor.length > 0) {
  const mult = computeCategorySigns(parsed.entries, map);
  const byVendor = new Map();
  for (const e of parsed.entries) {
    const cat = map[e.account] ?? 'ignore';
    if (!SPEND.has(cat)) continue;
    const payee = e.vendor || e.name || e.customer || '(No payee)';
    byVendor.set(payee, (byVendor.get(payee) ?? 0) + e.amount * mult[cat]);
  }
  console.log(`\nVENDOR COVERAGE: ${withVendor.length} of ${parsed.entries.length} entries carry a vendor/customer.`);
  console.log('TOP VENDORS (spend accounts):');
  for (const [v, total] of [...byVendor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${v.padEnd(30)} ${Math.round(total).toLocaleString()}`);
  }
}
