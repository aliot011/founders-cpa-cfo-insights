# Founders CPA · CFO Insights

A local-first tool for turning a **QuickBooks General Ledger** export into a CFO-style
month-over-month dashboard. Upload a CSV or Excel export and it computes and trends your
key metrics, with no backend and no database. The parsed ledger lives only in your browser
(`localStorage`), so nothing is ever uploaded to a server.

## Metrics tracked

Each month, with month-over-month (MoM) change:

- Revenue
- Gross Profit & Gross Margin
- Operating Expenses
- Net Operating Profit & Net Operating Margin
- Other Income / (Expense): the non-operating "OI/OE" line
- Net Income & Net Income Margin
- Cash (ending balance across cash/bank accounts)

## How it works

1. **Upload** a QuickBooks General Ledger export (`.csv`, `.xlsx`, `.xls`).
   In QuickBooks: **Reports → General Ledger**, set the date range, then **Export**.
2. The app parses the ledger, auto-detecting either grouped (account-header) or flat
   (account-per-row) layouts and either a single signed **Amount** column or separate
   **Debit/Credit** columns.
3. Every account is auto-classified into a category (Revenue, COGS, OpEx, Other
   Income/Expense, Cash, or Ignore) using account-number and name heuristics. You can
   **override any mapping** in the UI; metrics recompute instantly and the mapping is
   saved locally.
4. The dashboard shows latest-month KPIs with MoM deltas, trend charts, and a full
   metric-by-month table.

### A note on sign conventions

Ledger lines are normalized debit-positive. Because QuickBooks single-"Amount" exports
don't always follow that convention for income accounts, the app auto-detects a
per-category sign so revenue and expenses come out as positive magnitudes, then applies
standard P&L arithmetic. Check the **Account mapping** panel (which shows each account's
net) if any metric looks off.

## Storage

> The original ask was to store data in cookies, but a real general ledger far exceeds a
> cookie's ~4 KB limit, so the app uses `localStorage` instead (same "browser-only, no
> server" behavior, but holds megabytes). Use **Clear & upload new** to wipe it.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
npm run preview  # preview the production build
```

A sample export lives in [`samples/sample-general-ledger.csv`](samples/sample-general-ledger.csv);
`samples/verify.mjs` runs the parse → classify → metrics pipeline over it
(`npx tsx samples/verify.mjs`).

## Tech

React + TypeScript (Vite), [PapaParse](https://www.papaparse.com/) for CSV,
[SheetJS](https://sheetjs.com/) for Excel, [Recharts](https://recharts.org/) for charts.
