import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import type { AccountMap, ClientDataset, ClientSummary } from './types';
import { api, ApiError } from './lib/api';
import { formatMonth } from './lib/format';
import { clearLastClient, loadLastClient, saveLastClient } from './lib/storage';
import { ClientPicker } from './components/ClientPicker';
import { CompaniesTab } from './components/CompaniesTab';
import { Dashboard } from './components/Dashboard';
import { SyncTab } from './components/SyncTab';
import { UsersTab } from './components/UsersTab';
import logo from './assets/logo.jpeg';

/** Read and strip the params the OAuth callback redirect appends. */
function consumeUrlParams(): { client: string | null; connected: boolean; connectError: string | null } {
  const params = new URLSearchParams(window.location.search);
  const result = {
    client: params.get('client'),
    connected: params.get('connected') === '1',
    connectError: params.get('connect_error'),
  };
  if (result.client || result.connected || result.connectError) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  return result;
}

const EMPTY_DATASET: Omit<ClientDataset, 'companyName'> = {
  entries: [],
  accountMap: {},
  openingBalances: {},
  startDate: '',
  endDate: '',
  notes: [],
  lastSyncedAt: '',
};

export default function App() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dataset, setDataset] = useState<ClientDataset | null>(null);
  const [neverSynced, setNeverSynced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  // Force Dashboard remount (and tab reset) when switching clients.
  const [dashKey, setDashKey] = useState(0);
  const mapSaveTimer = useRef<number | null>(null);

  const refreshClients = useCallback(async (): Promise<ClientSummary[]> => {
    const list = await api.listClients();
    setClients(list);
    return list;
  }, []);

  const selectClient = useCallback((realmId: string | null) => {
    setSelected(realmId);
    setDataset(null);
    setNeverSynced(false);
    setError(null);
    setDashKey((k) => k + 1);
    if (realmId) saveLastClient(realmId);
  }, []);

  const loadDataset = useCallback(async (realmId: string) => {
    setLoading(true);
    setError(null);
    try {
      setDataset(await api.getDataset(realmId));
      setNeverSynced(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_found') {
        setDataset(null);
        setNeverSynced(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load data.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: list clients, honor the OAuth redirect params, restore the last-open client.
  useEffect(() => {
    const urlParams = consumeUrlParams();
    if (urlParams.connectError) setConnectError(urlParams.connectError);
    refreshClients()
      .then((list) => {
        const candidate = urlParams.client ?? loadLastClient();
        if (candidate && list.some((c) => c.realmId === candidate)) {
          selectClient(candidate);
          // A company was just connected — pull its first sync automatically.
          if (urlParams.connected && urlParams.client) {
            api
              .sync(urlParams.client)
              .then(() => Promise.all([loadDataset(urlParams.client!), refreshClients()]))
              .catch((err) => setError(err instanceof Error ? err.message : 'First sync failed.'));
          }
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not reach the API server.'));
  }, [refreshClients, selectClient, loadDataset]);

  // Load the selected client's dataset.
  useEffect(() => {
    if (selected) loadDataset(selected);
  }, [selected, loadDataset]);

  function handleMapChange(map: AccountMap) {
    if (!dataset || !selected) return;
    setDataset({ ...dataset, accountMap: map });
    // Debounced persist — mapping edits come in bursts from the Accounts tab.
    if (mapSaveTimer.current !== null) window.clearTimeout(mapSaveTimer.current);
    const realmId = selected;
    mapSaveTimer.current = window.setTimeout(() => {
      api.saveAccountMap(realmId, map).catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to save the account mapping.');
      });
    }, 500);
  }

  const client = clients?.find((c) => c.realmId === selected) ?? null;

  // Distinct synced months, ascending — drives the closed-month selector and topbar label.
  const syncedMonths = useMemo(
    () => [...new Set((dataset?.entries ?? []).map((e) => e.month))].sort(),
    [dataset],
  );
  const closedMonthLabel = client?.closedThrough ?? syncedMonths[syncedMonths.length - 1] ?? null;

  async function handleDataChanged() {
    if (selected) await Promise.all([loadDataset(selected), refreshClients()]);
  }

  async function handleDisconnected(realmId: string) {
    if (selected === realmId) {
      selectClient(null);
      clearLastClient();
    }
    await refreshClients();
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src={logo} alt="Startup Accounting Advisors" />
          <div>
            <div className="brand-title">Advisory Intelligence</div>
          </div>
        </div>
        {client && clients && (
          <div className="topbar-client">
            {clients.length > 1 ? (
              <select
                className="client-switcher"
                value={client.realmId}
                onChange={(e) => selectClient(e.target.value)}
                aria-label="Switch client"
              >
                {clients.map((c) => (
                  <option key={c.realmId} value={c.realmId}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            ) : (
              <span className="topbar-client-name">{client.companyName}</span>
            )}
            <span className="topbar-closed">
              {closedMonthLabel ? `Closed through ${formatMonth(closedMonthLabel)}` : 'Not synced yet'}
            </span>
          </div>
        )}
      </header>

      <main className="content">
        {clients === null ? (
          <p className="app-loading">{error ?? 'Loading…'}</p>
        ) : client ? (
          <>
            {error && <div className="upload-error sync-error">{error}</div>}
            {loading && !dataset ? (
              <p className="app-loading">Loading {client.companyName}…</p>
            ) : (
              <Dashboard
                key={`${client.realmId}:${dashKey}`}
                dataset={dataset ?? { ...EMPTY_DATASET, companyName: client.companyName }}
                onMapChange={handleMapChange}
                initialTab={neverSynced ? 'sync' : undefined}
                closedThrough={client.closedThrough}
                syncTab={
                  <SyncTab
                    client={client}
                    months={syncedMonths}
                    onDataChanged={handleDataChanged}
                    onDisconnected={() => handleDisconnected(client.realmId)}
                    onManageClients={() => selectClient(null)}
                  />
                }
                usersTab={<UsersTab clients={clients} />}
                companiesTab={
                  <CompaniesTab
                    clients={clients}
                    currentRealmId={client.realmId}
                    onOpen={selectClient}
                    onDisconnect={(c) => {
                      if (!confirm(`Disconnect ${c.companyName} from QuickBooks? Its synced data will be removed.`)) return;
                      api
                        .disconnect(c.realmId)
                        .then(() => handleDisconnected(c.realmId))
                        .catch((err) => setError(err instanceof Error ? err.message : 'Disconnect failed.'));
                    }}
                  />
                }
              />
            )}
          </>
        ) : (
          <ClientPicker
            clients={clients}
            connectError={connectError}
            onSelect={selectClient}
            onDisconnect={(c) => {
              api
                .disconnect(c.realmId)
                .then(() => refreshClients())
                .catch((err) => setConnectError(err instanceof Error ? err.message : 'Disconnect failed.'));
            }}
          />
        )}
      </main>
    </div>
  );
}
