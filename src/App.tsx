import { useEffect, useState } from 'react';
import './App.css';
import type { AccountMap, Dataset } from './types';
import { clearDataset, loadDataset, saveDataset, updateAccountMap } from './lib/storage';
import { Upload } from './components/Upload';
import { Dashboard } from './components/Dashboard';

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);

  useEffect(() => {
    setDataset(loadDataset());
  }, []);

  function handleLoaded(ds: Dataset) {
    saveDataset(ds);
    setDataset(ds);
  }

  function handleMapChange(map: AccountMap) {
    if (!dataset) return;
    setDataset(updateAccountMap(dataset, map));
  }

  function handleClear() {
    if (!confirm('Remove the loaded ledger from this browser? This cannot be undone.')) return;
    clearDataset();
    setDataset(null);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div>
            <div className="brand-title">Founders CPA · CFO Insights</div>
            <div className="brand-sub">Month-over-month general ledger analysis</div>
          </div>
        </div>
        {dataset && (
          <div className="topbar-meta">
            <span title={`Imported ${new Date(dataset.importedAt).toLocaleString()}`}>
              {dataset.fileName}
            </span>
            <button className="btn" onClick={handleClear}>
              Clear &amp; upload new
            </button>
          </div>
        )}
      </header>

      <main className="content">
        {dataset ? (
          <Dashboard dataset={dataset} onMapChange={handleMapChange} />
        ) : (
          <Upload onLoaded={handleLoaded} />
        )}
      </main>
    </div>
  );
}
