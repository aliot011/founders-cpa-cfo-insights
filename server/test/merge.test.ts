import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildQboAccountMap, categoryForAccount } from '../src/qbo/accounts.ts';
import type { QboAccount } from '../src/qbo/types.ts';

function account(overrides: Partial<QboAccount>): QboAccount {
  return { Id: '1', Name: 'X', FullyQualifiedName: 'X', AccountType: 'Expense', ...overrides };
}

test('categoryForAccount maps QBO account types', () => {
  assert.equal(categoryForAccount(account({ AccountType: 'Income' })), 'revenue');
  assert.equal(categoryForAccount(account({ AccountType: 'Cost of Goods Sold' })), 'cogs');
  assert.equal(categoryForAccount(account({ AccountType: 'Expense' })), 'opex');
  assert.equal(categoryForAccount(account({ AccountType: 'Other Income' })), 'other_income');
  assert.equal(categoryForAccount(account({ AccountType: 'Other Expense' })), 'other_expense');
  assert.equal(categoryForAccount(account({ AccountType: 'Bank' })), 'cash');
  assert.equal(categoryForAccount(account({ AccountType: 'Accounts Receivable' })), 'asset');
  assert.equal(categoryForAccount(account({ AccountType: 'Credit Card' })), 'liability_equity');
  assert.equal(categoryForAccount(account({ AccountType: 'Equity' })), 'liability_equity');
});

test('categoryForAccount falls back to name heuristics for unknown types', () => {
  assert.equal(categoryForAccount(account({ AccountType: 'SomethingNew', Name: 'Interest Income', FullyQualifiedName: 'Interest Income' })), 'other_income');
});

test('buildQboAccountMap keys both short and fully-qualified names', () => {
  const map = buildQboAccountMap([
    account({ Name: 'Plants and Soil', FullyQualifiedName: 'Job Materials:Plants and Soil', AccountType: 'Cost of Goods Sold' }),
  ]);
  assert.equal(map['Job Materials:Plants and Soil'], 'cogs');
  assert.equal(map['Plants and Soil'], 'cogs');
});

// mergeAccountMap lives in sync.ts, which pulls in db.ts (opens SQLite on
// import) — keep the test hermetic by re-importing only after stubbing env.
test('mergeAccountMap never overwrites user overrides', async () => {
  process.env.QBO_CLIENT_ID ??= 'test';
  process.env.QBO_CLIENT_SECRET ??= 'test';
  process.env.QBO_REDIRECT_URI ??= 'http://localhost/cb';
  const { mergeAccountMap } = await import('../src/sync.ts');

  const existing = { 'Design income': 'opex' as const }; // deliberate user override
  const fromQbo = { 'Design income': 'revenue' as const, 'Bank Charges': 'opex' as const };
  const { map, added } = mergeAccountMap(existing, fromQbo);

  assert.equal(map['Design income'], 'opex'); // override survived
  assert.equal(map['Bank Charges'], 'opex');
  assert.deepEqual(added, ['Bank Charges']);
});
