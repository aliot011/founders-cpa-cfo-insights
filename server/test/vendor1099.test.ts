import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountMap, LedgerEntry, VendorProfile } from '../../src/types.ts';
import { build1099Readiness } from '../../src/lib/vendor1099.ts';

const MAP: AccountMap = { 'Contract Labor': 'opex', Sales: 'revenue' };

function entry(month: string, vendor: string, amount: number, account = 'Contract Labor'): LedgerEntry {
  return { date: `${month}-10`, month, account, amount, vendor, name: vendor, transactionType: 'Bill' };
}

function vendor(name: string, over: Partial<VendorProfile> = {}): VendorProfile {
  return { id: name, name, tracked1099: false, hasTaxId: true, hasAddress: true, hasEmail: true, ...over };
}

test('splits active vendors into incomplete-tracked and untracked', () => {
  const entries = [
    entry('2026-01', 'Tracked Missing Email', 900),
    entry('2026-01', 'Tracked No TaxId', 700),
    entry('2026-01', 'Tracked Complete', 500),
    entry('2025-10', 'Untracked Corp', 1200),
    entry('2026-01', 'Untracked Corp', 2000),
  ];
  const vendors = [
    vendor('Tracked Missing Email', { tracked1099: true, hasEmail: false }),
    vendor('Tracked No TaxId', { tracked1099: true, hasTaxId: false }),
    vendor('Tracked Complete', { tracked1099: true }),
    vendor('Untracked Corp'),
  ];
  const r = build1099Readiness(entries, MAP, vendors, '2026-01');

  assert.deepEqual(r.incomplete.map((x) => x.vendor.name), ['Tracked Missing Email', 'Tracked No TaxId']);
  assert.deepEqual(r.untracked.map((x) => x.vendor.name), ['Untracked Corp']);
  // Tracked vendors are new too (first spend in January) but belong to incomplete, not newUntracked.
  assert.deepEqual(r.newUntracked, []);
  assert.equal(r.incomplete[0].spend, 900);
  assert.equal(r.incomplete[0].lastPaid, '2026-01-10');
});

test('ignores vendors with no spend in the trailing year', () => {
  const entries = [entry('2024-06', 'Dormant', 5000)]; // far outside the window
  const vendors = [vendor('Dormant', { tracked1099: true, hasAddress: false })];
  const r = build1099Readiness(entries, MAP, vendors, '2026-01');
  assert.equal(r.incomplete.length, 0);
  assert.equal(r.untracked.length, 0);
});

test('revenue activity does not make a vendor relevant', () => {
  const entries = [entry('2026-01', 'Refund Partner', 700, 'Sales')];
  const r = build1099Readiness(entries, MAP, [vendor('Refund Partner')], '2026-01');
  assert.equal(r.untracked.length, 0);
});

test('sorts by spend descending', () => {
  const entries = [
    entry('2025-11', 'Small', 100),
    entry('2025-12', 'Big', 9000),
    entry('2025-12', 'Mid', 1),
    entry('2026-01', 'Mid', 800),
  ];
  const vendors = [vendor('Small'), vendor('Big'), vendor('Mid')];
  const r = build1099Readiness(entries, MAP, vendors, '2026-01');
  assert.deepEqual(r.untracked.map((x) => x.vendor.name), ['Big', 'Mid', 'Small']); // Mid = 801
});

test('separates brand-new untracked vendors from established ones', () => {
  const entries = [
    entry('2025-09', 'Old Faithful', 300),
    entry('2026-01', 'Old Faithful', 300),
    entry('2026-01', 'Fresh Face LLC', 450),
  ];
  const vendors = [vendor('Old Faithful'), vendor('Fresh Face LLC')];
  const r = build1099Readiness(entries, MAP, vendors, '2026-01');

  assert.deepEqual(r.newUntracked.map((x) => x.vendor.name), ['Fresh Face LLC']);
  assert.deepEqual(r.untracked.map((x) => x.vendor.name), ['Old Faithful']);
  // Reviewing a later month, Fresh Face is no longer "new".
  const later = build1099Readiness([...entries, entry('2026-02', 'Fresh Face LLC', 450)], MAP, vendors, '2026-02');
  assert.deepEqual(later.newUntracked, []);
  assert.ok(later.untracked.some((x) => x.vendor.name === 'Fresh Face LLC'));
});
