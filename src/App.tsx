import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import './App.css';
import type { AccountMap, ClientDataset, ClientSummary } from './types';
import { api, ApiError } from './lib/api';
import { formatMonth } from './lib/format';
import {
  adminPath,
  checkForSegment,
  companyPath,
  companySlug,
  DEFAULT_CHECK_SEGMENT,
  DEFAULT_SEGMENT,
  findCompany,
  TAB_SEGMENTS,
  tabForSegment,
  type Side,
} from './lib/routes';
import { clearLastClient, loadLastClient, saveLastClient } from './lib/storage';
import { ClientPicker } from './components/ClientPicker';
import { CompaniesTab } from './components/CompaniesTab';
import { CompanySwitchModal } from './components/CompanySwitchModal';
import { Dashboard, PageHeader, PortalSeg } from './components/Dashboard';
import { SyncTab } from './components/SyncTab';
import { UsersTab } from './components/UsersTab';
import logo from './assets/logo.jpeg';

const EMPTY_DATASET: Omit<ClientDataset, 'companyName'> = {
  entries: [],
  accountMap: {},
  openingBalances: {},
  vendors: [],
  qboEnvironment: 'production',
  startDate: '',
  endDate: '',
  notes: [],
  lastSyncedAt: '',
};

/** One-shot boot flags (reset on full page load, survive route changes). */
let bootRedirectDone = false;

export default function App() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const refreshClients = useCallback(async (): Promise<ClientSummary[]> => {
    const list = await api.listClients();
    setClients(list);
    return list;
  }, []);

  useEffect(() => {
    refreshClients().catch((err) =>
      setListError(err instanceof Error ? err.message : 'Could not reach the API server.'),
    );
  }, [refreshClients]);

  if (clients === null) {
    return (
      <div className="app">
        <TopBar />
        <main className="content">
          <p className="app-loading">{listError ?? 'Loading…'}</p>
        </main>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomeRoute clients={clients} refreshClients={refreshClients} />} />
      <Route
        path="/client/:company/:tab?/:sub?"
        element={<CompanyRoute side="client" clients={clients} refreshClients={refreshClients} />}
      />
      <Route
        path="/advisor/:company/:tab?/:sub?"
        element={<CompanyRoute side="advisor" clients={clients} refreshClients={refreshClients} />}
      />
      <Route path="/admin/:tab?" element={<AdminRoute clients={clients} refreshClients={refreshClients} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ---- Topbar -----------------------------------------------------------

interface TopBarProps {
  clients?: ClientSummary[];
  client?: ClientSummary | null;
  /** Latest synced month (YYYY-MM), for the closed-through fallback label. */
  latestMonth?: string | null;
  /** Current portal + tab segment, so switching companies keeps the view. */
  side?: 'client' | 'advisor';
  segment?: string;
}

function TopBar({ clients, client, latestMonth, side, segment }: TopBarProps) {
  const navigate = useNavigate();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const closedMonth = client ? (client.closedThrough ?? latestMonth ?? null) : null;

  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-mark" src={logo} alt="Startup Accounting Advisors" />
        <div>
          <div className="brand-title">Advisory Intelligence</div>
        </div>
      </div>
      {client && clients && (
        <div className="topbar-client">
          <span className="topbar-client-name">{client.companyName}</span>
          <span className="topbar-closed">
            {closedMonth ? `Closed through ${formatMonth(closedMonth)}` : 'Not synced yet'}
          </span>
          {clients.length > 1 && (
            <button className="link-btn" onClick={() => setSwitcherOpen(true)}>
              Switch company
            </button>
          )}
        </div>
      )}
      {switcherOpen && client && clients && (
        <CompanySwitchModal
          clients={clients}
          currentRealmId={client.realmId}
          onSelect={(realmId) => {
            const next = clients.find((c) => c.realmId === realmId);
            if (next) navigate(companyPath(side ?? 'client', companySlug(clients, next), segment));
          }}
          onClose={() => setSwitcherOpen(false)}
        />
      )}
    </header>
  );
}

// ---- / (picker + boot redirect + OAuth return) -------------------------

interface RouteProps {
  clients: ClientSummary[];
  refreshClients: () => Promise<ClientSummary[]>;
}

function HomeRoute({ clients, refreshClients }: RouteProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [connectError, setConnectError] = useState<string | null>(null);

  // Boot: honor the OAuth callback params, else restore the last-open company.
  useEffect(() => {
    if (bootRedirectDone) return;
    bootRedirectDone = true;

    const err = searchParams.get('connect_error');
    if (err) {
      setConnectError(err);
      navigate('/', { replace: true });
      return;
    }
    const realm = searchParams.get('client');
    if (realm) {
      const connected = searchParams.get('connected') === '1';
      const c = clients.find((x) => x.realmId === realm);
      if (c) {
        navigate(
          `${companyPath('advisor', companySlug(clients, c), 'sync')}${connected ? '?connected=1' : ''}`,
          { replace: true },
        );
        return;
      }
    }
    const last = loadLastClient();
    const lastClient = last ? clients.find((c) => c.realmId === last) : undefined;
    if (lastClient) navigate(companyPath('client', companySlug(clients, lastClient)), { replace: true });
  }, [clients, navigate, searchParams]);

  return (
    <div className="app">
      <TopBar />
      <main className="content">
        <ClientPicker
          clients={clients}
          connectError={connectError}
          onSelect={(realmId) => {
            const c = clients.find((x) => x.realmId === realmId);
            if (c) navigate(companyPath('client', companySlug(clients, c)));
          }}
          onDisconnect={(c) => {
            api
              .disconnect(c.realmId)
              .then(() => refreshClients())
              .catch((err) => setConnectError(err instanceof Error ? err.message : 'Disconnect failed.'));
          }}
        />
      </main>
    </div>
  );
}

// ---- /client/:company/:tab and /advisor/:company/:tab ------------------

function CompanyRoute({ side, clients, refreshClients }: RouteProps & { side: 'client' | 'advisor' }) {
  const navigate = useNavigate();
  const params = useParams<{ company: string; tab?: string; sub?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const client = findCompany(clients, params.company) ?? null;
  const slug = client ? companySlug(clients, client) : null;
  const tab = tabForSegment(side, params.tab);
  const check = tab === 'checks' ? checkForSegment(params.sub) : undefined;

  const [dataset, setDataset] = useState<ClientDataset | null>(null);
  const [neverSynced, setNeverSynced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapSaveTimer = useRef<number | null>(null);
  const firstSyncStarted = useRef(false);

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

  const realmId = client?.realmId;
  useEffect(() => {
    if (!realmId) return;
    setDataset(null);
    setNeverSynced(false);
    saveLastClient(realmId);
    loadDataset(realmId);
  }, [realmId, loadDataset]);

  // Freshly connected via OAuth: run the first sync, then load.
  useEffect(() => {
    if (searchParams.get('connected') !== '1' || !realmId || firstSyncStarted.current) return;
    firstSyncStarted.current = true;
    setSearchParams({}, { replace: true });
    api
      .sync(realmId)
      .then(() => Promise.all([loadDataset(realmId), refreshClients()]))
      .catch((err) => setError(err instanceof Error ? err.message : 'First sync failed.'));
  }, [searchParams, setSearchParams, realmId, loadDataset, refreshClients]);

  function handleMapChange(map: AccountMap) {
    if (!dataset || !realmId) return;
    setDataset({ ...dataset, accountMap: map });
    // Debounced persist — mapping edits come in bursts from the Accounts tab.
    if (mapSaveTimer.current !== null) window.clearTimeout(mapSaveTimer.current);
    mapSaveTimer.current = window.setTimeout(() => {
      api.saveAccountMap(realmId, map).catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to save the account mapping.');
      });
    }, 500);
  }

  async function handleDataChanged() {
    if (realmId) await Promise.all([loadDataset(realmId), refreshClients()]);
  }

  const syncedMonths = useMemo(
    () => [...new Set((dataset?.entries ?? []).map((e) => e.month))].sort(),
    [dataset],
  );

  if (!client || !slug) return <Navigate to="/" replace />;
  if (!tab) return <Navigate to={companyPath(side, slug, DEFAULT_SEGMENT[side])} replace />;
  // Checks has sub-routes (/checks/:check); every other tab has none.
  if (tab === 'checks' && !check) {
    return <Navigate to={`${companyPath(side, slug, 'checks')}/${DEFAULT_CHECK_SEGMENT}`} replace />;
  }
  if (tab !== 'checks' && params.sub) return <Navigate to={companyPath(side, slug, params.tab)} replace />;
  // A company with no data yet only has the advisor's Sync tab to offer.
  if (neverSynced && side === 'client') return <Navigate to={companyPath('advisor', slug, 'sync')} replace />;

  return (
    <div className="app">
      <TopBar
        clients={clients}
        client={client}
        latestMonth={syncedMonths[syncedMonths.length - 1] ?? null}
        side={side}
        segment={params.sub ? `${params.tab}/${params.sub}` : params.tab}
      />
      <main className="content">
        {error && <div className="upload-error sync-error">{error}</div>}
        {loading && !dataset && !neverSynced ? (
          <p className="app-loading">Loading {client.companyName}…</p>
        ) : (
          <Dashboard
            key={client.realmId}
            dataset={dataset ?? { ...EMPTY_DATASET, companyName: client.companyName }}
            onMapChange={handleMapChange}
            side={side}
            tab={tab}
            slug={slug}
            check={check}
            realmId={client.realmId}
            onDataChanged={handleDataChanged}
            closedThrough={client.closedThrough}
            syncTab={
              <SyncTab
                client={client}
                months={syncedMonths}
                onDataChanged={handleDataChanged}
                onDisconnected={() => {
                  clearLastClient();
                  refreshClients().finally(() => navigate('/'));
                }}
                onManageClients={() => navigate('/')}
              />
            }
          />
        )}
      </main>
    </div>
  );
}

// ---- /admin/:tab --------------------------------------------------------

function AdminRoute({ clients, refreshClients }: RouteProps) {
  const navigate = useNavigate();
  const params = useParams<{ tab?: string }>();
  const [error, setError] = useState<string | null>(null);
  const tab = tabForSegment('admin', params.tab);

  // Client/Advisor portal buttons need a company to land on.
  const last = loadLastClient();
  const backClient = (last && clients.find((c) => c.realmId === last)) ?? clients[0] ?? null;
  const backSlug = backClient ? companySlug(clients, backClient) : null;

  if (!tab) return <Navigate to={adminPath()} replace />;

  return (
    <div className="app">
      <TopBar />
      <main className="content">
        <nav className="tabs" role="tablist">
          {TAB_SEGMENTS.admin.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab${tab === t.id ? ' active' : ''}`}
              onClick={() => navigate(adminPath(t.segment))}
            >
              {t.label}
            </button>
          ))}
          <div className="tabs-meta">
            <PortalSeg side={'admin' as Side} slug={backSlug} />
          </div>
        </nav>

        {error && <div className="upload-error sync-error">{error}</div>}

        {tab === 'users' && (
          <>
            <PageHeader
              title="Users"
              subtitle="Who can access Advisory Intelligence: admins run the practice, advisors work every company, and client users see only their own companies' reports."
            />
            <div className="section">
              <UsersTab clients={clients} />
            </div>
          </>
        )}

        {tab === 'companies' && (
          <>
            <PageHeader
              title="Companies"
              subtitle="Every QuickBooks company connected to the practice — open one, connect another, or disconnect one you no longer serve."
            />
            <div className="section">
              <CompaniesTab
                clients={clients}
                onDisconnect={(c) => {
                  if (!confirm(`Disconnect ${c.companyName} from QuickBooks? Its synced data will be removed.`)) return;
                  if (loadLastClient() === c.realmId) clearLastClient();
                  api
                    .disconnect(c.realmId)
                    .then(() => refreshClients())
                    .catch((err) => setError(err instanceof Error ? err.message : 'Disconnect failed.'));
                }}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
