# Founders CPA · CFO Insights

A multi-client tool that pulls each client's **QuickBooks Online General Ledger** through
the QBO API and turns it into a CFO-style month-over-month dashboard. Connect a client's
QuickBooks company once, then refresh their numbers whenever you want from the **Sync** tab.

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

1. **Connect a client**: the app sends you to Intuit's consent screen; pick the client's
   company and approve. One connection per client, stored server-side.
2. **Sync** pulls the GeneralLedger report (chunked by calendar year, full company history
   by default) plus the Chart of Accounts, and stores the normalized ledger in SQLite.
3. Every account is auto-classified into a category (Revenue, COGS, OpEx, Other
   Income/Expense, Cash, …) from its QBO **AccountType**, falling back to name heuristics.
   You can **override any mapping** in the Accounts tab; overrides are saved per client and
   always survive re-syncs.
4. The dashboard shows latest-month KPIs with MoM deltas, trend charts, a full
   metric-by-month table, and flux analysis — switch clients from the top bar.

### A note on sign conventions

The GL report's amounts are natural-signed (`subt_nat_amount`). The app auto-detects a
per-category sign so revenue and expenses come out as positive magnitudes, then applies
standard P&L arithmetic. Check the **Accounts** tab (which shows each account's net) if any
metric looks off.

### A note on the sync date range

The Cash metric is a running balance from the first synced transaction, so syncs default to
the **full company history** (Intuit's `CompanyStartDate`). You can override the start date
per client on the Sync tab, but a later start date will misstate cash.

## Setup

### 1. Create an Intuit app

1. Sign in at [developer.intuit.com](https://developer.intuit.com) and create an app with
   the **Accounting** scope (`com.intuit.quickbooks.accounting`).
2. Under the app's Keys & credentials, add the redirect URI
   `http://localhost:5173/api/auth/callback` (Intuit allows plain http for localhost only).
3. Copy the Client ID and Client Secret. Development keys work against **sandbox**
   companies; switching to real client data requires the app's **Production** keys, an
   HTTPS redirect URI, and `QBO_ENVIRONMENT=production`.

### 2. Configure and run

```bash
cp .env.example .env   # paste in QBO_CLIENT_ID / QBO_CLIENT_SECRET
npm install
npm run dev            # Vite (5173) + Express API (3001) together
```

Open http://localhost:5173, click **Connect a client to QuickBooks**, and run the first sync.

### Other commands

```bash
npm test         # server unit tests (GL transform, account-map merge)
npm run build    # type-check + production build
npm start        # production mode: Express serves the built dist/ and the API
npm run lint     # oxlint
```

## Storage & security

- Per-client OAuth tokens and synced datasets live in `data/app.db` (SQLite, gitignored).
  Intuit refresh tokens **rotate on every refresh**; the server persists the newest pair
  automatically. If a client's refresh token expires (~100 days idle), the UI shows a
  **Reconnect** prompt.
- App credentials live in `.env` (gitignored). Never commit either.
- The Express server has **no authentication of its own** — it's built to run locally or on
  a trusted internal network. Put it behind at least a shared password / reverse-proxy auth
  before exposing it anywhere shared. For extra hardening, token columns could be encrypted
  at rest with a `TOKEN_ENCRYPTION_KEY` (not implemented).

## Tech

- **Frontend**: React + TypeScript (Vite), [Recharts](https://recharts.org/) for charts.
- **Server**: Express 5 + better-sqlite3, run with `tsx` (no build step); talks to the
  QuickBooks Online v3 API (OAuth 2.0, GeneralLedger report, Account query).
- The server imports `src/types.ts` and `src/lib/classify.ts` directly, so the ledger data
  model and classification heuristics have a single source of truth.
