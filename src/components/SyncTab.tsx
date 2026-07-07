import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import type { AccountingMethod, ClientDataset, ClientSummary, SyncLogEntry } from '../types.ts';

interface Props {
  client: ClientSummary;
  dataset: ClientDataset | null;
  /** Called after a successful sync or settings change so the app refetches. */
  onDataChanged: () => void;
  onDisconnected: () => void;
}

export function SyncTab({ client, dataset, onDataChanged, onDisconnected }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<SyncLogEntry[]>([]);
  const [startDate, setStartDate] = useState(client.syncStartDate ?? '');
  const [savingSettings, setSavingSettings] = useState(false);
  const [method, setMethod] = useState<AccountingMethod>(client.accountingMethod);

  const refreshLog = useCallback(() => {
    api.getSyncLog(client.realmId).then(setLog).catch(() => setLog([]));
  }, [client.realmId]);

  useEffect(() => {
    refreshLog();
    setStartDate(client.syncStartDate ?? '');
    setMethod(client.accountingMethod);
    setError(null);
  }, [client.realmId, client.syncStartDate, client.accountingMethod, refreshLog]);

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
      refreshLog();
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
            <h3>QuickBooks sync</h3>
            <button className="btn btn-primary" onClick={handleSync} disabled={busy || client.status === 'needs_reauth'}>
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
          <div className="panel-body sync-status">
            {dataset ? (
              <>
                <div className="sync-fact">
                  <span className="sync-fact-label">Last synced</span>
                  <span>{new Date(dataset.lastSyncedAt).toLocaleString()}</span>
                </div>
                <div className="sync-fact">
                  <span className="sync-fact-label">Transactions</span>
                  <span>{dataset.entries.length.toLocaleString()}</span>
                </div>
                <div className="sync-fact">
                  <span className="sync-fact-label">Period</span>
                  <span>
                    {dataset.startDate} → {dataset.endDate}
                  </span>
                </div>
                {dataset.notes.length > 0 && (
                  <div className="notes sync-notes">
                    {dataset.notes.map((n, i) => (
                      <span key={i} className="note-chip">
                        {n}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="sync-empty">
                <strong>{client.companyName}</strong> hasn&rsquo;t been synced yet. Run the first sync to pull its
                General Ledger from QuickBooks — the dashboard tabs light up once data lands.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="panel">
          <div className="panel-head">
            <h3>Sync settings</h3>
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

      {log.length > 0 && (
        <div className="section">
          <div className="panel">
            <div className="panel-head">
              <h3>Sync history</h3>
            </div>
            <div className="table-scroll">
              <table className="metrics sync-log">
                <thead>
                  <tr>
                    <th className="metric-name">Started</th>
                    <th>Status</th>
                    <th>Transactions</th>
                    <th className="sync-log-msg">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((row) => (
                    <tr key={row.id}>
                      <td className="metric-name">{new Date(row.startedAt).toLocaleString()}</td>
                      <td className={`sync-log-status ${row.status}`}>{row.status}</td>
                      <td>{row.entryCount != null ? row.entryCount.toLocaleString() : '—'}</td>
                      <td className="sync-log-msg">{row.message ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="section">
        <button className="btn sync-disconnect" onClick={handleDisconnect}>
          Disconnect {client.companyName} from QuickBooks
        </button>
      </div>
    </>
  );
}
