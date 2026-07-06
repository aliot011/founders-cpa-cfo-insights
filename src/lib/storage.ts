import type { AccountMap, Dataset } from '../types';

const KEY = 'founders-cfo-insights:dataset:v1';

export function saveDataset(ds: Dataset): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ds));
  } catch (err) {
    console.error('Failed to persist dataset (storage full?)', err);
    throw new Error(
      'Could not save the data to your browser. The ledger may be too large for localStorage.',
    );
  }
}

export function loadDataset(): Dataset | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Dataset;
  } catch (err) {
    console.error('Failed to load dataset', err);
    return null;
  }
}

export function clearDataset(): void {
  localStorage.removeItem(KEY);
}

export function updateAccountMap(ds: Dataset, accountMap: AccountMap): Dataset {
  const next = { ...ds, accountMap };
  saveDataset(next);
  return next;
}
