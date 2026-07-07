import type { ClientSummary } from '../types.ts';

interface Props {
  clients: ClientSummary[];
  connectError: string | null;
  onSelect: (realmId: string) => void;
  onDisconnect: (client: ClientSummary) => void;
}

export function ClientPicker({ clients, connectError, onSelect, onDisconnect }: Props) {
  return (
    <div className="upload-wrap">
      <h1>Advisory Intelligence</h1>
      <p className="upload-lede">
        Connect each client&rsquo;s QuickBooks Online company once, then pull their General Ledger on demand.
        Pick a client below to open their dashboard.
      </p>

      {connectError && <div className="upload-error">QuickBooks connection failed: {connectError}</div>}

      {clients.length > 0 && (
        <div className="panel client-list">
          {clients.map((c) => (
            <div key={c.realmId} className="client-row">
              <button className="client-open" onClick={() => onSelect(c.realmId)}>
                <span className="client-name">{c.companyName}</span>
                <span className="client-meta">
                  {c.status === 'needs_reauth'
                    ? 'Reconnect required'
                    : c.lastSyncedAt
                      ? `Last synced ${new Date(c.lastSyncedAt).toLocaleString()}`
                      : 'Never synced'}
                </span>
              </button>
              {c.status === 'needs_reauth' && (
                <a className="btn btn-xs" href="/api/auth/connect">
                  Reconnect
                </a>
              )}
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  if (confirm(`Disconnect ${c.companyName} from QuickBooks? Its synced data will be removed.`)) {
                    onDisconnect(c);
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}

      <a className="btn btn-primary connect-btn" href="/api/auth/connect">
        {clients.length > 0 ? 'Connect another client' : 'Connect a client to QuickBooks'}
      </a>

      <p className="upload-note">
        Connecting opens Intuit&rsquo;s sign-in page. Choose the client&rsquo;s company and approve access; you&rsquo;ll
        be brought straight back here.
      </p>
    </div>
  );
}
