import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountMap, LedgerEntry } from '../../src/types.ts';
import { findMultiAccountVendors } from '../../src/lib/multiAccount.ts';

const MAP: AccountMap = {
  'Supplies': 'opex',
  'Equipment Rental': 'opex',
  'Job Materials': 'cogs',
  'Sales': 'revenue',
};

function entry(month: string, vendor: string | undefined, amount: number, account: string): LedgerEntry {
  return { date: `${month}-10`, month, account, amount, vendor, name: vendor, transactionType: 'Expense' };
}

test('flags vendors hitting two or more expense accounts in the window', () => {
  const entries = [
    entry('2025-11', 'Hicks Hardware', 100, 'Supplies'),
    entry('2025-12', 'Hicks Hardware', 250, 'Job Materials'),
    entry('2026-01', 'Hicks Hardware', 40, 'Supplies'),
    entry('2026-01', 'Single Source', 900, 'Supplies'),
  ];
  const result = findMultiAccountVendors(entries, MAP, '2026-01');

  assert.equal(result.length, 1);
  const v = result[0];
  assert.equal(v.vendor, 'Hicks Hardware');
  assert.equal(v.total, 390);
  assert.equal(v.months.length, 6);
  assert.equal(v.months[5], '2026-01');
  // Rows sorted by total: Job Materials (250) before Supplies (140).
  assert.deepEqual(v.rows.map((r) => r.account), ['Job Materials', 'Supplies']);
  assert.equal(v.rows[1].byMonth['2026-01'], 40);
});

test('ignores activity outside the window, revenue accounts, and vendorless lines', () => {
  const entries = [
    entry('2025-01', 'Hicks Hardware', 100, 'Supplies'), // outside 6-month window
    entry('2026-01', 'Hicks Hardware', 250, 'Job Materials'),
    entry('2026-01', 'Hicks Hardware', 500, 'Sales'), // revenue: ignored
    entry('2026-01', undefined, 75, 'Supplies'),
    entry('2025-12', undefined, 75, 'Equipment Rental'),
  ];
  assert.equal(findMultiAccountVendors(entries, MAP, '2026-01').length, 0);
});

test('sorts by account count, then total', () => {
  const entries = [
    entry('2026-01', 'Two Accounts Big', 900, 'Supplies'),
    entry('2026-01', 'Two Accounts Big', 900, 'Job Materials'),
    entry('2026-01', 'Two Accounts Small', 10, 'Supplies'),
    entry('2026-01', 'Two Accounts Small', 10, 'Job Materials'),
    entry('2026-01', 'Three Accounts', 5, 'Supplies'),
    entry('2026-01', 'Three Accounts', 5, 'Job Materials'),
    entry('2026-01', 'Three Accounts', 5, 'Equipment Rental'),
  ];
  assert.deepEqual(
    findMultiAccountVendors(entries, MAP, '2026-01').map((v) => v.vendor),
    ['Three Accounts', 'Two Accounts Big', 'Two Accounts Small'],
  );
});
