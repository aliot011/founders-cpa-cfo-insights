import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { transformReport, yearChunks } from '../src/qbo/generalLedger.ts';
import type { GeneralLedgerReport } from '../src/qbo/types.ts';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFixture(name: string): GeneralLedgerReport {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf8')) as GeneralLedgerReport;
}

test('transformReport flattens data rows across nested sections', () => {
  const { entries, skipped } = transformReport(loadFixture('gl-report.sample.json'));

  assert.equal(entries.length, 6);
  assert.equal(skipped, 1); // the Beginning Balance row

  const first = entries[0];
  assert.deepEqual(first, {
    date: '2025-01-15',
    month: '2025-01',
    account: 'Design income',
    amount: 225,
    name: "Amy's Bird Sanctuary",
    vendor: undefined,
    customer: "Amy's Bird Sanctuary",
    memo: 'Logo design',
    transactionType: 'Invoice',
  });

  // Sub-account rows take the fully-qualified path from their own column.
  const subAccount = entries.filter((e) => e.account === 'Landscaping Services:Job Materials:Plants and Soil');
  assert.equal(subAccount.length, 2);
  assert.equal(subAccount[0].vendor, 'Norton Lumber');
  assert.equal(subAccount[1].amount, -24.36);

  // Natural signs pass through untouched (metrics normalizes downstream).
  const expense = entries.find((e) => e.memo === 'Utilities bill');
  assert.equal(expense?.amount, -86.44);

  // Summary rows never become entries.
  assert.ok(entries.every((e) => !e.account.startsWith('Total')));
});

test('transformReport falls back to the section header when the account column is blank', () => {
  const report: GeneralLedgerReport = {
    Columns: {
      Column: [
        { ColType: 'account_name', ColTitle: 'Account' },
        { ColType: 'tx_date', ColTitle: 'Date' },
        { ColType: 'subt_nat_amount', ColTitle: 'Amount' },
      ],
    },
    Rows: {
      Row: [
        {
          type: 'Section',
          Header: { ColData: [{ value: 'Pest Control Services' }, { value: '' }, { value: '' }] },
          Rows: {
            Row: [
              {
                type: 'Data',
                ColData: [{ value: '' }, { value: '2025-05-01' }, { value: '35.00' }],
              },
            ],
          },
        },
      ],
    },
  };
  const { entries } = transformReport(report);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].account, 'Pest Control Services');
});

test('transformReport indexes columns by ColType, not position', () => {
  // Same data, shuffled column order (e.g. class tracking changes the layout).
  const report: GeneralLedgerReport = {
    Columns: {
      Column: [
        { ColType: 'tx_date', ColTitle: 'Date' },
        { ColType: 'subt_nat_amount', ColTitle: 'Amount' },
        { ColType: 'account_name', ColTitle: 'Account' },
      ],
    },
    Rows: {
      Row: [
        {
          type: 'Data',
          ColData: [{ value: '2025-06-02' }, { value: '-12.50' }, { value: 'Bank Charges' }],
        },
      ],
    },
  };
  const { entries } = transformReport(report);
  assert.deepEqual(
    { date: entries[0].date, amount: entries[0].amount, account: entries[0].account },
    { date: '2025-06-02', amount: -12.5, account: 'Bank Charges' },
  );
});

test('transformReport handles an empty report', () => {
  const { entries, skipped } = transformReport({ Rows: {} });
  assert.equal(entries.length, 0);
  assert.equal(skipped, 0);
});

test('yearChunks splits a range into calendar years', () => {
  assert.deepEqual(yearChunks('2023-06-15', '2025-07-07'), [
    { start: '2023-06-15', end: '2023-12-31' },
    { start: '2024-01-01', end: '2024-12-31' },
    { start: '2025-01-01', end: '2025-07-07' },
  ]);
  assert.deepEqual(yearChunks('2025-01-01', '2025-07-07'), [{ start: '2025-01-01', end: '2025-07-07' }]);
});
