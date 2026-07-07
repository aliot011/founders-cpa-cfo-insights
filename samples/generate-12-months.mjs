// Generates a QuickBooks-style General Ledger CSV with 12 months of clean,
// double-entry data (2026-01 .. 2026-12). Run: node samples/generate-12-months.mjs
import { writeFileSync } from 'node:fs';

const YEAR = 2026;
const round = (n) => Math.round(n);
const d = (m, day) => `${String(m).padStart(2, '0')}/${String(day).padStart(2, '0')}/${YEAR}`;

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

/** GL lines: { date, account, type, num, name, memo, split, amount } (debit-positive). */
const lines = [];
let num = 1000;

// A balanced transaction = one debit leg + one credit leg for the same amount.
function txn(date, debitAcct, creditAcct, amount, type, name, memo) {
  const n = String(++num);
  lines.push({ date, account: debitAcct, type, num: n, name, memo, split: creditAcct, amount });
  lines.push({ date, account: creditAcct, type, num: n, name, memo, split: debitAcct, amount: -amount });
}

// Opening owner contribution.
txn(d(1, 2), '1000 Checking', '3000 Owners Equity', 60000, 'Deposit', 'Owner', 'Opening capital');

for (let m = 1; m <= 12; m++) {
  const growth = Math.pow(1.045, m - 1);
  const product = round(16000 * growth);
  const consulting = round(7000 * growth);
  const revenue = product + consulting;
  const cogs = round(product * 0.42);
  const payroll = m <= 6 ? 8000 : 9000;
  const rent = 2600;
  const marketing = round(1400 * Math.pow(1.06, m - 1));

  // Sales invoiced to A/R.
  txn(d(m, 5), '1200 Accounts Receivable', '4000 Product Revenue', product, 'Invoice', 'Customer', 'Monthly product sales');
  txn(d(m, 6), '1200 Accounts Receivable', '4100 Consulting Revenue', consulting, 'Invoice', 'Client', 'Consulting engagement');

  // Collections (~82% of the month's billings hit cash this month).
  const collected = round(revenue * 0.82);
  txn(d(m, 20), '1000 Checking', '1200 Accounts Receivable', collected, 'Payment', 'Customer', 'Customer payments');

  // COGS billed to A/P, pay most of it.
  txn(d(m, 8), '5000 Cost of Goods Sold', '2000 Accounts Payable', cogs, 'Bill', 'Supplier', 'Inventory / materials');
  txn(d(m, 24), '2000 Accounts Payable', '1000 Checking', round(cogs * 0.8), 'Bill Payment', 'Supplier', 'Pay vendor');

  // Payroll & rent paid from cash.
  txn(d(m, 15), '6000 Payroll Expense', '1000 Checking', payroll, 'Check', 'Staff', 'Payroll run');
  txn(d(m, 1), '6100 Rent Expense', '1000 Checking', rent, 'Check', 'Landlord', 'Office rent');

  // Marketing on the credit card, then pay the card down.
  txn(d(m, 12), '6200 Marketing Expense', '2100 Credit Card', marketing, 'Credit Card Charge', 'Ads', 'Advertising');
  txn(d(m, 28), '2100 Credit Card', '1000 Checking', round(marketing * 0.9), 'Credit Card Payment', 'Card', 'Pay card');

  // Interest income on cash, interest expense on financing.
  txn(d(m, 30), '1000 Checking', '7000 Interest Income', 40, 'Deposit', 'Bank', 'Interest earned');
  txn(d(m, 18), '8000 Interest Expense', '1000 Checking', 220, 'Check', 'Bank', 'Loan interest');
}

// One capital expenditure in March.
txn(d(3, 10), '1500 Equipment', '1000 Checking', 9000, 'Check', 'Vendor', 'Equipment purchase');

// ---- Emit grouped QuickBooks-style CSV -------------------------------------
const COLS = 9;
const row = (cells) => cells.concat(Array(COLS - cells.length).fill('')).join(',');
const money = (n) => (n < 0 ? `-${Math.abs(n).toFixed(2)}` : n.toFixed(2));
const q = (s) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const out = [];
out.push(row(['Founders Demo Co']));
out.push(row(['General Ledger']));
out.push(row([`January 1 - December 31, ${YEAR}`]));
out.push(row(['']));
out.push(row(['', 'Date', 'Transaction Type', 'Num', 'Name', 'Memo/Description', 'Split', 'Amount', 'Balance']));

for (const account of ORDER) {
  const acctLines = lines
    .filter((l) => l.account === account)
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.num) - Number(b.num));
  if (acctLines.length === 0) continue;

  out.push(row([account]));
  let bal = 0;
  for (const l of acctLines) {
    bal += l.amount;
    out.push(
      [
        '',
        l.date,
        q(l.type),
        l.num,
        q(l.name),
        q(l.memo),
        q(l.split),
        money(l.amount),
        money(bal),
      ].join(','),
    );
  }
  out.push(row([`Total for ${account}`, '', '', '', '', '', '', money(bal), money(bal)]));
}

const csv = out.join('\n') + '\n';
writeFileSync(new URL('./sample-12-months.csv', import.meta.url), csv);
console.log(`Wrote sample-12-months.csv: ${lines.length} lines across ${ORDER.length} accounts.`);
