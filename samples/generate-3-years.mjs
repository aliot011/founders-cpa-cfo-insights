// Generates a QuickBooks-style General Ledger CSV with 3 years of clean,
// double-entry data (2024-01 .. 2026-12). Run: node samples/generate-3-years.mjs
import { writeFileSync } from 'node:fs';

const YEARS = [2024, 2025, 2026];
const round = (n) => Math.round(n);
const d = (y, m, day) => `${String(m).padStart(2, '0')}/${String(day).padStart(2, '0')}/${y}`;

// Ordered chart of accounts (name only; classification is by the app).
const ORDER = [
  '1000 Checking',
  '1200 Accounts Receivable',
  '1500 Equipment',
  '2000 Accounts Payable',
  '2100 Credit Card',
  '3000 Owners Equity',
  '4000 Product Revenue',
  '4100 Consulting Revenue',
  '5000 Cost of Goods Sold',
  '6000 Payroll Expense',
  '6100 Rent Expense',
  '6200 Marketing Expense',
  '7000 Interest Income',
  '8000 Interest Expense',
];

// Per-year operating assumptions (company scales up as it grows).
const PAYROLL = { 2024: 8000, 2025: 9500, 2026: 11000 };
const RENT = { 2024: 2600, 2025: 2800, 2026: 3000 };
// Capital expenditures: one per year, in different months.
const CAPEX = [
  { y: 2024, m: 3, amount: 9000 },
  { y: 2025, m: 6, amount: 12000 },
  { y: 2026, m: 9, amount: 15000 },
];

/** GL lines: { date, account, type, num, name, memo, split, amount } (debit-positive). */
const lines = [];
let num = 1000;

function txn(date, debitAcct, creditAcct, amount, type, name, memo) {
  const n = String(++num);
  lines.push({ date, account: debitAcct, type, num: n, name, memo, split: creditAcct, amount });
  lines.push({ date, account: creditAcct, type, num: n, name, memo, split: debitAcct, amount: -amount });
}

// Opening owner contribution at the very start.
txn(d(2024, 1, 2), '1000 Checking', '3000 Owners Equity', 60000, 'Deposit', 'Owner', 'Opening capital');

let i = 0; // global month index for compounding
for (const y of YEARS) {
  for (let m = 1; m <= 12; m++, i++) {
    const growth = Math.pow(1.025, i); // ~2.5%/month
    const product = round(15000 * growth);
    const consulting = round(6000 * growth);
    const revenue = product + consulting;
    const cogs = round(product * 0.42);
    const payroll = PAYROLL[y];
    const rent = RENT[y];
    const marketing = round(1300 * Math.pow(1.03, i));

    // Sales invoiced to A/R.
    txn(d(y, m, 5), '1200 Accounts Receivable', '4000 Product Revenue', product, 'Invoice', 'Customer', 'Monthly product sales');
    txn(d(y, m, 6), '1200 Accounts Receivable', '4100 Consulting Revenue', consulting, 'Invoice', 'Client', 'Consulting engagement');

    // Collections (~82% of billings hit cash this month).
    const collected = round(revenue * 0.82);
    txn(d(y, m, 20), '1000 Checking', '1200 Accounts Receivable', collected, 'Payment', 'Customer', 'Customer payments');

    // COGS billed to A/P, pay most of it.
    txn(d(y, m, 8), '5000 Cost of Goods Sold', '2000 Accounts Payable', cogs, 'Bill', 'Supplier', 'Inventory / materials');
    txn(d(y, m, 24), '2000 Accounts Payable', '1000 Checking', round(cogs * 0.8), 'Bill Payment', 'Supplier', 'Pay vendor');

    // Payroll & rent paid from cash.
    txn(d(y, m, 15), '6000 Payroll Expense', '1000 Checking', payroll, 'Check', 'Staff', 'Payroll run');
    txn(d(y, m, 1), '6100 Rent Expense', '1000 Checking', rent, 'Check', 'Landlord', 'Office rent');

    // Marketing on the credit card, then pay the card down.
    txn(d(y, m, 12), '6200 Marketing Expense', '2100 Credit Card', marketing, 'Credit Card Charge', 'Ads', 'Advertising');
    txn(d(y, m, 28), '2100 Credit Card', '1000 Checking', round(marketing * 0.9), 'Credit Card Payment', 'Card', 'Pay card');

    // Interest income on cash, interest expense on financing.
    txn(d(y, m, 30), '1000 Checking', '7000 Interest Income', 45, 'Deposit', 'Bank', 'Interest earned');
    txn(d(y, m, 18), '8000 Interest Expense', '1000 Checking', 210, 'Check', 'Bank', 'Loan interest');
  }
}

// Annual capital expenditures.
for (const c of CAPEX) {
  txn(d(c.y, c.m, 10), '1500 Equipment', '1000 Checking', c.amount, 'Check', 'Vendor', 'Equipment purchase');
}

// ---- Emit grouped QuickBooks-style CSV -------------------------------------
const COLS = 9;
const row = (cells) => cells.concat(Array(COLS - cells.length).fill('')).join(',');
const money = (n) => (n < 0 ? `-${Math.abs(n).toFixed(2)}` : n.toFixed(2));
const q = (s) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const out = [];
out.push(row(['Founders Demo Co']));
out.push(row(['General Ledger']));
out.push(row([`January 1, ${YEARS[0]} - December 31, ${YEARS[YEARS.length - 1]}`]));
out.push(row(['']));
out.push(row(['', 'Date', 'Transaction Type', 'Num', 'Name', 'Memo/Description', 'Split', 'Amount', 'Balance']));

for (const account of ORDER) {
  const acctLines = lines
    .filter((l) => l.account === account)
    .sort((a, b) => toKey(a.date) - toKey(b.date) || Number(a.num) - Number(b.num));
  if (acctLines.length === 0) continue;

  out.push(row([account]));
  let bal = 0;
  for (const l of acctLines) {
    bal += l.amount;
    out.push(['', l.date, q(l.type), l.num, q(l.name), q(l.memo), q(l.split), money(l.amount), money(bal)].join(','));
  }
  out.push(row([`Total for ${account}`, '', '', '', '', '', '', money(bal), money(bal)]));
}

// MM/DD/YYYY -> sortable number
function toKey(date) {
  const [mm, dd, yyyy] = date.split('/').map(Number);
  return yyyy * 10000 + mm * 100 + dd;
}

const csv = out.join('\n') + '\n';
writeFileSync(new URL('./sample-3-years.csv', import.meta.url), csv);
console.log(`Wrote sample-3-years.csv: ${lines.length} lines across ${ORDER.length} accounts.`);
