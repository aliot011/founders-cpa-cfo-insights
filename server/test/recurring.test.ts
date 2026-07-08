import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountMap, LedgerEntry } from '../../src/types.ts';
import { findMissingRecurringVendors } from '../../src/lib/recurring.ts';

const MAP: AccountMap = {
  'Contract Labor': 'opex',
  'Software': 'opex',
  'Sales': 'revenue',
};

function entry(month: string, vendor: string | undefined, amount: number, account = 'Contract Labor'): LedgerEntry {
  return {
    date: `${month}-15`,
    month,
    account,
    amount,
    vendor,
    name: vendor,
    transactionType: 'Journal Entry',
  };
}

/** A vendor with the given monthly amounts, ending the month before the target. */
function monthly(vendor: string, months: string[], amounts: number[]): LedgerEntry[] {
  return months.map((m, i) => entry(m, vendor, amounts[i] ?? amounts[0]));
}

const HISTORY = ['2025-09', '2025-10', '2025-11', '2025-12'];

test('flags a steady monthly vendor absent in the target month', () => {
  const entries = monthly('Apex Contracting', HISTORY, [1500, 1500, 1500, 1500]);
  const misses = findMissingRecurringVendors(entries, MAP, '2026-01');

  assert.equal(misses.length, 1);
  const m = misses[0];
  assert.equal(m.vendor, 'Apex Contracting');
  assert.equal(m.streak, 4);
  assert.equal(m.avgAmount, 1500);
  assert.equal(m.steady, true);
  assert.equal(m.avgTxns, 1);
  assert.deepEqual(m.accounts, ['Contract Labor']);
  assert.equal(m.lastSeen, '2025-12-15');
});

test('does not flag a vendor that is present in the target month', () => {
  const entries = [...monthly('Apex Contracting', HISTORY, [1500]), entry('2026-01', 'Apex Contracting', 1500)];
  assert.equal(findMissingRecurringVendors(entries, MAP, '2026-01').length, 0);
});

test('does not flag once the streak no longer touches the month before the target', () => {
  // Gone since November: was flagged when December was reviewed, not now.
  const entries = monthly('Apex Contracting', ['2025-08', '2025-09', '2025-10'], [1500]);
  assert.equal(findMissingRecurringVendors(entries, MAP, '2026-01').length, 0);
  assert.equal(findMissingRecurringVendors(entries, MAP, '2025-11').length, 1);
});

test('requires a minimum streak', () => {
  const entries = monthly('Apex Contracting', ['2025-11', '2025-12'], [1500]);
  assert.equal(findMissingRecurringVendors(entries, MAP, '2026-01').length, 0);
});

test('marks irregular spend as not steady and reports the range', () => {
  const entries = monthly('Odd Jobs LLC', HISTORY, [200, 1900, 700, 1200]);
  const [m] = findMissingRecurringVendors(entries, MAP, '2026-01');
  assert.equal(m.steady, false);
  assert.equal(m.minAmount, 200);
  assert.equal(m.maxAmount, 1900);
});

test('aggregates across accounts and ignores revenue and vendorless lines', () => {
  const entries = [
    ...monthly('Apex Contracting', HISTORY, [1000]),
    ...HISTORY.map((m) => entry(m, 'Apex Contracting', 90, 'Software')),
    ...HISTORY.map((m) => entry(m, 'Apex Contracting', 5000, 'Sales')), // revenue: ignored
    ...HISTORY.map((m) => entry(m, undefined, 40)), // no payee: invisible here
  ];
  const misses = findMissingRecurringVendors(entries, MAP, '2026-01');
  assert.equal(misses.length, 1);
  assert.deepEqual(misses[0].accounts, ['Contract Labor', 'Software']);
  assert.equal(misses[0].avgAmount, 1090);
  assert.equal(misses[0].avgTxns, 2);
});

test('sorts steady vendors first, then by size', () => {
  const entries = [
    ...monthly('Odd Jobs LLC', HISTORY, [200, 1900, 700, 9000]),
    ...monthly('Apex Contracting', HISTORY, [1500]),
    ...monthly('Tiny Steady Co', HISTORY, [100]),
  ];
  const misses = findMissingRecurringVendors(entries, MAP, '2026-01');
  assert.deepEqual(
    misses.map((m) => m.vendor),
    ['Apex Contracting', 'Tiny Steady Co', 'Odd Jobs LLC'],
  );
});
