import { useRef, useState } from 'react';
import { parseFile } from '../lib/parse';
import { buildAccountMap } from '../lib/classify';
import type { Dataset } from '../types';

interface Props {
  onLoaded: (ds: Dataset) => void;
}

export function Upload({ onLoaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const result = await parseFile(file);
      const ds: Dataset = {
        entries: result.entries,
        accountMap: buildAccountMap(result.accounts),
        fileName: result.fileName,
        importedAt: new Date().toISOString(),
        notes: result.notes,
      };
      onLoaded(ds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse the file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload-wrap">
      <h1>Founders CPA · CFO Insights</h1>
      <p className="upload-lede">
        Upload a QuickBooks <strong>General Ledger</strong> export (CSV or Excel) to see month-over-month
        movement in your key metrics. Everything is parsed and stored locally in your browser. Nothing is ever
        uploaded to a server.
      </p>

      <div
        className={`dropzone${drag ? ' drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
      >
        <div className="dropzone-icon">↑</div>
        <h3>{busy ? 'Parsing…' : 'Drop your General Ledger here'}</h3>
        <p>or click to browse (.csv, .xlsx, .xls)</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && <div className="upload-error">{error}</div>}

      <p className="upload-note">
        In QuickBooks: <strong>Reports → General Ledger</strong>, set your date range to cover the months you
        want to compare, then <strong>Export</strong> to CSV or Excel.
      </p>
    </div>
  );
}
