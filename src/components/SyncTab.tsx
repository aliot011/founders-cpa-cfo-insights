import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { formatMonth } from '../lib/format.ts';
import type { AccountingMethod, ClientSummary } from '../types.ts';

interface Props {
  client: ClientSummary;
  /** Distinct synced months (YYYY-MM, ascending) for the closed-month selector. */
  months: string[];
  /** Called after a successful sync or settings change so the app refetches. */
  onDataChanged: () => void;
  onDisconnected: () => void;
  onManageClients: () => void;
}

export function SyncTab({ client, months, onDataChanged, onDisconnected, onManageClients }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(client.syncStartDate ?? '');
  const [savingSettings, setSavingSettings] = useState(false);
  const [method, setMethod] = useState<AccountingMethod>(client.accountingMethod);
  const [closedThrough, setClosedThrough] = useState(client.closedThrough ?? '');

  useEffect(() => {
    setStartDate(client.syncStartDate ?? '');
    setMethod(client.accountingMethod);
    setClosedThrough(client.closedThrough ?? '');
    setError(null);
  }, [client.realmId, client.syncStartDate, client.accountingMethod, client.closedThrough]);

  async function handleSync() {
    setBusy(true);
    setError(null);
    try {
      await api.sync(client.realmId);
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveStartDate() {
    setSavingSettings(true);
    setError(null);
    try {
      await api.saveSettings(client.realmId, { syncStartDate: startDate || null });
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleMethodChange(next: AccountingMethod) {
    const prev = method;
    setMethod(next);
    setError(null);
    try {
      await api.saveSettings(client.realmId, { accountingMethod: next });
      onDataChanged();
    } catch (err) {
      setMethod(prev);
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    }
  }

  async function handleClosedThroughChange(next: string) {
    const prev = closedThrough;
    setClosedThrough(next);
    setError(null);
    try {
      await api.saveSettings(client.realmId, { closedThrough: next || null });
      onDataChanged();
    } catch (err) {
      setClosedThrough(prev);
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    }
  }

  async function handleDisconnect() {
    if (!confirm(`Disconnect ${client.companyName} from QuickBooks? Its synced data will be removed.`)) return;
    try {
      await api.disconnect(client.realmId);
      onDisconnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed.');
    }
  }

  return (
    <>
      {client.status === 'needs_reauth' && (
        <div className="callout">
          QuickBooks authorization for <strong>{client.companyName}</strong> has expired.{' '}
          <a href="/api/auth/connect">Reconnect the company</a> to resume syncing.
        </div>
      )}

      {error && <div className="upload-error sync-error">{error}</div>}

      <div className="section">
        <div className="panel">
          <div className="panel-head">
            <h3>Sync settings</h3>
            <button className="btn btn-primary" onClick={handleSync} disabled={busy || client.status === 'needs_reauth'}>
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
          <div className="panel-body">
            <label className="sync-setting">
              <span>
                Accounting basis
                <span className="sync-setting-hint">
                  How QuickBooks reports this client&rsquo;s ledger: accrual counts invoices and bills when
                  they&rsquo;re recorded; cash counts them when money moves. Takes effect on the next sync.
                </span>
              </span>
              <span className="sync-setting-controls">
                <select value={method} onChange={(e) => handleMethodChange(e.target.value as AccountingMethod)}>
                  <option value="Accrual">Accrual</option>
                  <option value="Cash">Cash</option>
                </select>
              </span>
            </label>
            <label className="sync-setting">
              <span>
                Most recent closed month
                <span className="sync-setting-hint">
                  Summary, KPIs, Detail, Flux, and Vendor Spend run through this month only, so an in-progress
                  month never muddies the reports. Checks always cover every synced month.
                </span>
              </span>
              <span className="sync-setting-controls">
                <select value={closedThrough} onChange={(e) => handleClosedThroughChange(e.target.value)}>
                  <option value="">Latest synced month</option>
                  {[...months].reverse().map((m) => (
                    <option key={m} value={m}>{formatMonth(m)}</option>
                  ))}
                </select>
              </span>
            </label>
            <label className="sync-setting">
              <span>
                Pull transactions from
                <span className="sync-setting-hint">
                  Leave blank for full company history{client.companyStartDate ? ` (since ${client.companyStartDate})` : ''}.
                  The Cash metric is a running balance from the first synced transaction, so a later start date will
                  misstate cash.
                </span>
              </span>
              <span className="sync-setting-controls">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <button
                  className="btn"
                  onClick={handleSaveStartDate}
                  disabled={savingSettings || (client.syncStartDate ?? '') === startDate}
                >
                  {savingSettings ? 'Saving…' : 'Save'}
                </button>
              </span>
            </label>
            <p className="sync-setting-note">
              Scheduled automatic refresh isn&rsquo;t available yet — use <em>Sync now</em> whenever you want fresh
              numbers.
            </p>
          </div>
        </div>
      </div>

      <div className="section sync-footer">
        <button className="btn" onClick={onManageClients}>
          Manage clients
        </button>
        <button className="btn sync-disconnect" onClick={handleDisconnect}>
          Disconnect {client.companyName} from QuickBooks
        </button>
      </div>
    </>
  );
}
