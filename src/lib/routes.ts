import type { ClientSummary } from '../types.ts';
import type { TabId } from '../components/Dashboard.tsx';

/** The three portals, mirrored in the first URL segment. */
export type Side = 'client' | 'advisor' | 'admin';

/** Tab id -> URL segment, per side (segments are what users see and share). */
export const TAB_SEGMENTS: Record<Side, { id: TabId; segment: string; label: string }[]> = {
  client: [
    { id: 'summary', segment: 'summary', label: 'Summary' },
    { id: 'kpis', segment: 'kpis', label: 'KPIs' },
    { id: 'detail', segment: 'detail', label: 'Detail' },
    { id: 'variance', segment: 'flux', label: 'Flux' },
    { id: 'vendors', segment: 'vendor-spend', label: 'Vendor Spend' },
  ],
  advisor: [
    { id: 'checks', segment: 'checks', label: 'Checks' },
    { id: 'accounts', segment: 'accounts', label: 'Accounts' },
    { id: 'sync', segment: 'sync', label: 'Sync' },
  ],
  admin: [
    { id: 'users', segment: 'users', label: 'Users' },
    { id: 'companies', segment: 'companies', label: 'Companies' },
  ],
};

export const DEFAULT_SEGMENT: Record<Side, string> = {
  client: 'summary',
  advisor: 'checks',
  admin: 'users',
};

export function tabForSegment(side: Side, segment: string | undefined): TabId | undefined {
  return TAB_SEGMENTS[side].find((t) => t.segment === segment)?.id;
}

// ---- Checks sub-routes: /advisor/:company/checks/:check ----------------

export type CheckId = 'missing-vendor' | 'missing-customer' | 'missing-recurring' | 'multi-account';

export const CHECK_SEGMENTS: { id: CheckId; segment: string }[] = [
  { id: 'missing-vendor', segment: 'missing-vendors' },
  { id: 'missing-customer', segment: 'missing-customers' },
  { id: 'missing-recurring', segment: 'missing-recurring' },
  { id: 'multi-account', segment: 'multi-account-vendors' },
];

export const DEFAULT_CHECK_SEGMENT = CHECK_SEGMENTS[0].segment;

export function checkForSegment(segment: string | undefined): CheckId | undefined {
  return CHECK_SEGMENTS.find((c) => c.segment === segment)?.id;
}

export function checkSegment(id: CheckId): string {
  return CHECK_SEGMENTS.find((c) => c.id === id)!.segment;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'company'
  );
}

/**
 * URL identifier for a company: its name slug, with a realm-id suffix only
 * when two companies would otherwise collide.
 */
export function companySlug(clients: ClientSummary[], client: ClientSummary): string {
  const slug = slugify(client.companyName);
  const collides = clients.some((c) => c.realmId !== client.realmId && slugify(c.companyName) === slug);
  return collides ? `${slug}-${client.realmId.slice(-4)}` : slug;
}

/** Resolve a URL company segment back to a client (slug first, realm id as fallback). */
export function findCompany(clients: ClientSummary[], param: string | undefined): ClientSummary | undefined {
  if (!param) return undefined;
  return clients.find((c) => companySlug(clients, c) === param) ?? clients.find((c) => c.realmId === param);
}

/** Path builders. Admin routes are practice-wide, so they take no company. */
export function companyPath(side: 'client' | 'advisor', slug: string, segment?: string): string {
  return `/${side}/${slug}/${segment ?? DEFAULT_SEGMENT[side]}`;
}

export function adminPath(segment?: string): string {
  return `/admin/${segment ?? DEFAULT_SEGMENT.admin}`;
}
