import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientSummary } from '../types.ts';

interface Props {
  clients: ClientSummary[];
  currentRealmId: string;
  onSelect: (realmId: string) => void;
  onClose: () => void;
}

/** Search-and-pick modal for jumping between connected companies. */
export function CompanySwitchModal({ clients, currentRealmId, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? clients.filter((c) => c.companyName.toLowerCase().includes(q)) : clients;
  }, [clients, query]);

  function choose(realmId: string) {
    onSelect(realmId);
    onClose();
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Switch company">
        <div className="modal-head">
          <h3>Switch company</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <input
          ref={inputRef}
          className="modal-search"
          placeholder="Search companies…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered.length > 0) choose(filtered[0].realmId);
          }}
        />
        <div className="modal-list">
          {filtered.map((c) => (
            <button
              key={c.realmId}
              className={`modal-item${c.realmId === currentRealmId ? ' current' : ''}`}
              onClick={() => choose(c.realmId)}
            >
              <span className="modal-item-name">{c.companyName}</span>
              <span className="modal-item-meta">
                {c.status !== 'ok'
                  ? 'needs reconnect'
                  : c.lastSyncedAt
                    ? `synced ${new Date(c.lastSyncedAt).toLocaleDateString()}`
                    : 'never synced'}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="muted modal-empty">No companies match &ldquo;{query}&rdquo;.</p>
          )}
        </div>
      </div>
    </div>
  );
}
