import { formatMonth } from '../lib/format.ts';
import type { ClientSummary } from '../types.ts';

interface Props {
  clients: ClientSummary[];
  /** The company currently open in the dashboard. */
  currentRealmId: string;
  onOpen: (realmId: string) => void;
  onDisconnect: (client: ClientSummary) => void;
}

export function CompaniesTab({ clients, currentRealmId, onOpen, onDisconnect }: Props) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Connected companies</h3>
        <a className="btn btn-primary connect-btn" href="/api/auth/connect">
          Connect a company
        </a>
      </div>
      <div className="table-scroll">
        <table className="metrics checks">
          <thead>
            <tr>
              <th>Company</th>
              <th>Status</th>
              <th>Last synced</th>
              <th>Basis</th>
              <th>Closed through</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.realmId}>
                <td>
                  {c.companyName}
                  {c.realmId === currentRealmId && <span className="muted"> (open)</span>}
                </td>
                <td>
                  <span className={`sync-log-status ${c.status === 'ok' ? 'success' : 'error'}`}>
                    {c.status === 'ok' ? 'connected' : 'needs reauth'}
                  </span>
                </td>
                <td>{c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleDateString() : 'never'}</td>
                <td>{c.accountingMethod}</td>
                <td>{c.closedThrough ? formatMonth(c.closedThrough) : 'Latest'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {c.realmId !== currentRealmId && (
                    <button className="btn btn-xs" onClick={() => onOpen(c.realmId)}>
                      Open
                    </button>
                  )}{' '}
                  <button className="btn btn-xs sync-disconnect" onClick={() => onDisconnect(c)}>
                    Disconnect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="var-caption" style={{ padding: '0 18px 14px' }}>
        Connecting opens Intuit&rsquo;s sign-in page — pick the client&rsquo;s company and approve access.
        Disconnecting revokes the QuickBooks authorization and removes the synced data.
      </p>
    </div>
  );
}
