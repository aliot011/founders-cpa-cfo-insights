// Generates a QuickBooks-style General Ledger CSV that includes Vendor and
// Customer columns, feeding the Vendor Spend tab. Twelve months of clean,
// double-entry data (2026-01 .. 2026-12). Run: node samples/generate-vendor-gl.mjs
import { writeFileSync } from 'node:fs';

const YEAR = 2026;
const round = (n) => Math.round(n);
const d = (m, day) => `${String(m).padStart(2, '0')}/${String(day).padStart(2, '0')}/${YEAR}`;

// Ordered chart of accounts (name only; classification is by the app).
const ORDER = [
  '1000 Checking',
  '1200 Accounts Receivable',
  '1500 Computer Equipment',
  '2000 Accounts Payable',
  '2100 Credit Card',
  '3000 Owners Equity',
  '4000 Subscription Revenue',
  '4100 Professional Services Revenue',
  '5000 Hosting & Infrastructure',
  '5100 Merchant Processing Fees',
  '6000 Payroll & Benefits',
  '6100 Rent & Facilities',
  '6200 Advertising & Marketing',
  '6300 Software Subscriptions',
  '6400 Professional Services',
  '6500 Travel & Meals',
  '7000 Interest Income',
  '8000 Interest Expense',
];

/** GL lines: debit-positive, both legs of every transaction. */
const lines = [];
let num = 2000;

// A balanced transaction = one debit leg + one credit leg for the same amount.
// `who` = { name, vendor, customer } (name mirrors QBO's payee column).
function txn(date, debitAcct, creditAcct, amount, type, who, memo) {
  const n = String(++num);
  const base = { date, type, num: n, memo, ...who };
  lines.push({ ...base, account: debitAcct, split: creditAcct, amount });
  lines.push({ ...base, account: creditAcct, split: debitAcct, amount: -amount });
}

const vend = (name) => ({ name, vendor: name, customer: '' });
const cust = (name) => ({ name, vendor: '', customer: name });

// Opening owner contribution.
txn(d(1, 2), '1000 Checking', '3000 Owners Equity', 100000, 'Deposit', { name: 'Owner', vendor: '', customer: '' }, 'Opening capital');

// ---- Revenue: monthly invoices per customer, collected the 15th of the next month.
// [account, customer, amount-for-month (0 = none)]
const CUSTOMERS = [
  ['4000 Subscription Revenue', 'Acme Corp', (m) => round(9800 * Math.pow(1.025, m - 1))],
  ['4000 Subscription Revenue', 'Globex Inc', () => 6400],
  ['4000 Subscription Revenue', 'Initech LLC', (m) => (m >= 3 ? 4900 : 0)],
  ['4100 Professional Services Revenue', 'Stark Industries', (m) => (m >= 2 && m <= 5 ? 9000 : 0)],
  ['4100 Professional Services Revenue', 'Wayne Enterprises', (m) => (m >= 8 && m <= 11 ? 12000 : 0)],
];

// ---- Vendor spend definitions: [account, vendor, rail, day, amount-for-month]
// rail: 'ap' = bill now, bill-payment on the 10th of the next month;
//       'card' = credit-card charge, card paid in full the 6th of the next month;
//       'check' = paid straight from checking.
const META_ADS = [900, 850, 1600, 1200, 950, 1000, 1500, 1400, 1100, 1900, 2400, 1300];
const VENDORS = [
  ['5000 Hosting & Infrastructure', 'Amazon Web Services', 'ap', 3, (m) => round(2400 * Math.pow(1.035, m - 1))],
  ['5000 Hosting & Infrastructure', 'Cloudflare', 'ap', 3, () => 400],
  ['5000 Hosting & Infrastructure', 'Datadog', 'ap', 3, (m) => (m >= 4 ? 680 : 0)],
  ['6000 Payroll & Benefits', 'Gusto', 'check', 15, (m) => (m >= 7 ? 14500 : 12500)],
  ['6000 Payroll & Benefits', 'Blue Shield of CA', 'check', 1, () => 980],
  ['6100 Rent & Facilities', 'WeWork', 'check', 1, () => 3400],
  ['6200 Advertising & Marketing', 'Google Ads', 'card', 12, (m) => round(1800 * Math.pow(1.06, m - 1))],
  ['6200 Advertising & Marketing', 'Meta Ads', 'card', 14, (m) => META_ADS[m - 1]],
  ['6200 Advertising & Marketing', 'LinkedIn Ads', 'card', 16, (m) => (m >= 7 ? 1250 : 0)],
  ['6300 Software Subscriptions', 'Slack', 'card', 8, () => 340],
  ['6300 Software Subscriptions', 'Notion', 'card', 8, () => 190],
  ['6300 Software Subscriptions', 'GitHub', 'card', 8, () => 260],
  ['6300 Software Subscriptions', 'Figma', 'card', 8, (m) => (m >= 4 ? 240 : 0)],
  ['6300 Software Subscriptions', 'Salesforce', 'card', 9, (m) => (m >= 9 ? 1550 : 0)],
  ['6400 Professional Services', 'Startup Accounting Advisors', 'ap', 5, () => 1500],
  ['6400 Professional Services', 'Wilson & Gray LLP', 'ap', 18, (m) => (m % 3 === 0 ? 2600 : 0)],
  ['6500 Travel & Meals', 'Delta Air Lines', 'card', 21, (m) => ({ 3: 1240, 6: 980, 10: 1460 }[m] ?? 0)],
  ['6500 Travel & Meals', 'Marriott', 'card', 22, (m) => ({ 3: 920, 6: 780, 10: 1150 }[m] ?? 0)],
  ['8000 Interest Expense', 'First Republic Bank', 'check', 28, () => 210],
];

const TYPE_FOR_RAIL = { ap: 'Bill', card: 'Credit Card Charge', check: 'Check' };
const MEMOS = {
  '5000 Hosting & Infrastructure': 'Cloud infrastructure',
  '5100 Merchant Processing Fees': 'Payment processing fees',
  '6000 Payroll & Benefits': 'Payroll and benefits',
  '6100 Rent & Facilities': 'Office rent',
  '6200 Advertising & Marketing': 'Advertising',
  '6300 Software Subscriptions': 'SaaS subscription',
  '6400 Professional Services': 'Professional services',
  '6500 Travel & Meals': 'Business travel',
  '8000 Interest Expense': 'Loan interest',
};

for (let m = 1; m <= 12; m++) {
  // Invoices this month; collect last month's invoices on the 15th.
  let invoiced = 0;
  for (const [account, name, amt] of CUSTOMERS) {
    const a = amt(m);
    if (a > 0) {
      invoiced += a;
      txn(d(m, 4), '1200 Accounts Receivable', account, a, 'Invoice', cust(name), 'Monthly billing');
    }
    if (m > 1) {
      const prior = amt(m - 1);
      if (prior > 0) {
        txn(d(m, 15), '1000 Checking', '1200 Accounts Receivable', prior, 'Payment', cust(name), 'Invoice payment');
      }
    }
  }

  // Stripe fees on this month's billings, netted from checking.
  const stripeFee = round(invoiced * 0.029);
  txn(d(m, 26), '5100 Merchant Processing Fees', '1000 Checking', stripeFee, 'Expense', vend('Stripe'), MEMOS['5100 Merchant Processing Fees']);

  // Vendor spend on each rail; settle last month's A/P bills and card balance.
  let cardBalance = 0;
  for (const [account, name, rail, day, amt] of VENDORS) {
    const a = amt(m);
    if (a > 0) {
      const memo = MEMOS[account];
      if (rail === 'ap') {
        txn(d(m, day), account, '2000 Accounts Payable', a, TYPE_FOR_RAIL.ap, vend(name), memo);
      } else if (rail === 'card') {
        txn(d(m, day), account, '2100 Credit Card', a, TYPE_FOR_RAIL.card, vend(name), memo);
      } else {
        txn(d(m, day), account, '1000 Checking', a, TYPE_FOR_RAIL.check, vend(name), memo);
      }
    }
    if (m > 1 && rail === 'ap') {
      const prior = amt(m - 1);
      if (prior > 0) {
        txn(d(m, 10), '2000 Accounts Payable', '1000 Checking', prior, 'Bill Payment', vend(name), 'Pay bill');
      }
    }
    if (m > 1 && rail === 'card') cardBalance += amt(m - 1);
  }
  if (cardBalance > 0) {
    txn(d(m, 6), '2100 Credit Card', '1000 Checking', cardBalance, 'Credit Card Payment', vend('Chase'), 'Pay card balance in full');
  }

  // Interest earned on deposits.
  txn(d(m, 30), '1000 Checking', '7000 Interest Income', 45, 'Deposit', { name: 'First Republic Bank', vendor: '', customer: '' }, 'Interest earned');
}

// One capital purchase in February.
txn(d(2, 9), '1500 Computer Equipment', '1000 Checking', 6200, 'Check', vend('Apple'), 'Laptops for new hires');

// ---- Emit grouped QuickBooks-style CSV -------------------------------------
const COLS = 11;
const row = (cells) => cells.concat(Array(COLS - cells.length).fill('')).join(',');
const money = (n) => (n < 0 ? `-${Math.abs(n).toFixed(2)}` : n.toFixed(2));
const q = (s) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const out = [];
out.push(row(['Founders Demo Co']));
out.push(row(['General Ledger']));
out.push(row([`January 1 - December 31, ${YEAR}`]));
out.push(row(['']));
out.push(row(['', 'Date', 'Transaction Type', 'Num', 'Name', 'Vendor', 'Customer', 'Memo/Description', 'Split', 'Amount', 'Balance']));

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
        q(l.vendor),
        q(l.customer),
        q(l.memo),
        q(l.split),
        money(l.amount),
        money(bal),
      ].join(','),
    );
  }
  out.push(row([`Total for ${account}`, '', '', '', '', '', '', '', '', money(bal), money(bal)]));
}

const csv = out.join('\n') + '\n';
writeFileSync(new URL('./sample-vendor-gl.csv', import.meta.url), csv);
console.log(`Wrote sample-vendor-gl.csv: ${lines.length} lines across ${ORDER.length} accounts.`);
