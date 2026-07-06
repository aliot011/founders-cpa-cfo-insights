// Quick end-to-end sanity check of the parse -> classify -> metrics pipeline.
// Run with: npx tsx samples/verify.mjs
import { readFileSync } from 'node:fs';
import { parseFile } from '../src/lib/parse.ts';
import { buildAccountMap } from '../src/lib/classify.ts';
import { computeMetrics } from '../src/lib/metrics.ts';

const buf = readFileSync(new URL('./sample-general-ledger.csv', import.meta.url));
const file = new File([buf], 'sample-general-ledger.csv', { type: 'text/csv' });

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
