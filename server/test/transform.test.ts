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
  // Fixture captured from a live sandbox response (pruned): columns are keyed
  // by MetaData ColKey with generic ColTypes, and column order differs from
  // the request.
  const { entries, openingBalances, skipped } = transformReport(loadFixture('gl-report.sample.json'));

  assert.equal(entries.length, 12);
  assert.equal(skipped, 1); // the Beginning Balance row

  const first = entries[0];
  assert.deepEqual(first, {
    date: '2026-01-06',
    month: '2026-01',
    account: 'Checking',
    amount: -5.66, // natural sign passes through untouched
    name: "Bob's Burger Joint",
    vendor: "Bob's Burger Joint",
    customer: undefined,
    memo: undefined,
    transactionType: 'Cash Expense',
    txnId: '135', // from the txn_type cell's metadata — powers QBO deep links
  });

  // Beginning Balance rows become opening balances keyed by their section.
  assert.deepEqual(openingBalances, { Checking: 4321.4 });

  // Sub-account rows take the fully-qualified path from their own column,
  // and vendor + customer can coexist on one line (billable job expense).
  const subAccount = entries.filter((e) => e.account === 'Job Expenses:Job Materials:Decks and Patios');
  assert.equal(subAccount.length, 3);
  assert.equal(subAccount[1].vendor, 'Norton Lumber and Building Materials');
  assert.equal(subAccount[1].customer, 'Travis Waldron');

  // Customer-only income rows keep the customer column.
  const invoice = entries.find((e) => e.transactionType === 'Invoice');
  assert.equal(invoice?.customer, 'Paulsen Medical Supplies');

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

test('transformReport indexes columns by MetaData ColKey, not position or ColType', () => {
  // Live shape: generic ColTypes, key in MetaData, shuffled order. Amounts may
  // carry thousands separators.
  const report: GeneralLedgerReport = {
    Columns: {
      Column: [
        { ColType: 'Date', ColTitle: 'Date', MetaData: [{ Name: 'ColKey', Value: 'tx_date' }] },
        { ColType: 'Money', ColTitle: 'Amount', MetaData: [{ Name: 'ColKey', Value: 'subt_nat_amount' }] },
        { ColType: 'String', ColTitle: 'Account', MetaData: [{ Name: 'ColKey', Value: 'account_name' }] },
      ],
    },
    Rows: {
      Row: [
        {
          type: 'Data',
          ColData: [{ value: '2025-06-02' }, { value: '-1,212.50' }, { value: 'Bank Charges' }],
        },
      ],
    },
  };
  const { entries } = transformReport(report);
  assert.deepEqual(
    { date: entries[0].date, amount: entries[0].amount, account: entries[0].account },
    { date: '2025-06-02', amount: -1212.5, account: 'Bank Charges' },
  );
});

test('transformReport falls back to ColType keys for older report shapes', () => {
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
  assert.equal(entries[0].amount, -12.5);
});

test('transformReport throws when the response lacks date/amount columns', () => {
  // e.g. the request forgot subt_nat_amount — better a loud sync error than
  // silently skipping every row as "0 transactions".
  const report: GeneralLedgerReport = {
    Columns: {
      Column: [{ ColType: 'Date', ColTitle: 'Date', MetaData: [{ Name: 'ColKey', Value: 'tx_date' }] }],
    },
    Rows: { Row: [{ type: 'Data', ColData: [{ value: '2025-06-02' }] }] },
  };
  assert.throws(() => transformReport(report), /subt_nat_amount/);
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
