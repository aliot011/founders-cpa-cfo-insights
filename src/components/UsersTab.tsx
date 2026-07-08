import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import type { AppUser, ClientSummary, UserRole } from '../types.ts';

interface Props {
  clients: ClientSummary[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  advisor: 'Advisor',
  client: 'Client',
};

export function UsersTab({ clients }: Props) {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add-user form state.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('client');
  const [realmIds, setRealmIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  function refresh() {
    api.listUsers().then(setUsers).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      await api.createUser({ name, email, role, realmIds: [...realmIds] });
      setName('');
      setEmail('');
      setRealmIds(new Set());
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the user.');
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(user: AppUser, nextRole: UserRole) {
    setError(null);
    try {
      // A user becoming a client needs a company; default to the first one.
      const fields =
        nextRole === 'client' && user.companies.length === 0 && clients.length > 0
          ? { role: nextRole, realmIds: [clients[0].realmId] }
          : { role: nextRole };
      await api.updateUser(user.id, fields);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the user.');
    }
  }

  async function handleCompaniesChange(user: AppUser, next: Set<string>) {
    setError(null);
    try {
      await api.updateUser(user.id, { realmIds: [...next] });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the user.');
    }
  }

  async function handleDelete(user: AppUser) {
    if (!confirm(`Remove ${user.name} (${user.email})?`)) return;
    setError(null);
    try {
      await api.deleteUser(user.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the user.');
    }
  }

  const canAdd = name.trim() && email.trim() && (role !== 'client' || realmIds.size > 0);

  return (
    <div className="panel panel-pop">
      <div className="panel-head">
        <h3>Users</h3>
        <span className="muted" style={{ fontSize: 13 }}>
          {users ? `${users.length} user${users.length === 1 ? '' : 's'}` : 'Loading…'}
        </span>
      </div>
      <div className="panel-body">
        {error && <div className="upload-error sync-error">{error}</div>}

        <div className="user-form">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          {role === 'client' && (
            <CompanyPicker clients={clients} selected={realmIds} onChange={setRealmIds} />
          )}
          <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !canAdd}>
            {adding ? 'Adding…' : 'Add user'}
          </button>
        </div>

        {users && users.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 16 }}>
            <table className="metrics checks">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Companies</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <select
                        className="user-role"
                        value={u.role}
                        onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                      >
                        {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {u.role === 'client' ? (
                        <CompanyPicker
                          clients={clients}
                          selected={new Set(u.companies.map((c) => c.realmId))}
                          onChange={(next) => handleCompaniesChange(u, next)}
                          label={
                            u.companies.length > 0
                              ? u.companies.map((c) => c.companyName).join(', ')
                              : 'Choose companies'
                          }
                        />
                      ) : (
                        <span className="muted">All companies</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-xs sync-disconnect" onClick={() => handleDelete(u)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {users && users.length === 0 && (
          <p className="sync-empty" style={{ marginTop: 16 }}>
            No users yet. Add yourself as an admin, your team as advisors, and client contacts as clients
            scoped to their companies. Sign-in will use this directory.
          </p>
        )}
      </div>
    </div>
  );
}

interface PickerProps {
  clients: ClientSummary[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  label?: string;
}

/** Multi-select dropdown of connected companies. */
function CompanyPicker({ clients, selected, onChange, label }: PickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(ev: MouseEvent) {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(realmId: string) {
    const next = new Set(selected);
    if (next.has(realmId)) next.delete(realmId);
    else next.add(realmId);
    onChange(next);
  }

  return (
    <div className="acct-dd" ref={ref}>
      <button className="btn acct-dd-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label ?? `${selected.size} of ${clients.length} companies`} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="acct-dd-panel">
          {clients.map((c) => (
            <label key={c.realmId} className="acct-dd-item">
              <input type="checkbox" checked={selected.has(c.realmId)} onChange={() => toggle(c.realmId)} />
              <span>{c.companyName}</span>
            </label>
          ))}
          {clients.length === 0 && <span className="muted">No companies connected yet.</span>}
        </div>
      )}
    </div>
  );
}
