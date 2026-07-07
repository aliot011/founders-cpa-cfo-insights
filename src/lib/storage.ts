// The dataset itself lives server-side now; the browser only remembers which
// client was last open.

const LAST_CLIENT_KEY = 'founders-cfo-insights:last-client';

export function saveLastClient(realmId: string): void {
  try {
    localStorage.setItem(LAST_CLIENT_KEY, realmId);
  } catch {
    // Non-essential; ignore storage failures.
  }
}

export function loadLastClient(): string | null {
  try {
    return localStorage.getItem(LAST_CLIENT_KEY);
  } catch {
    return null;
  }
}

export function clearLastClient(): void {
  try {
    localStorage.removeItem(LAST_CLIENT_KEY);
  } catch {
    // ignore
  }
}
