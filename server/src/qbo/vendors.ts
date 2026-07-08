import type { VendorProfile } from '../../../src/types.ts';
import { qboFetch } from './client.ts';

interface QboVendor {
  Id: string;
  DisplayName: string;
  Vendor1099?: boolean;
  BillAddr?: { Line1?: string; City?: string; PostalCode?: string };
  PrimaryEmailAddr?: { Address?: string };
  Active?: boolean;
}

interface VendorQueryResponse {
  QueryResponse: { Vendor?: QboVendor[] };
}

const PAGE_SIZE = 1000;

/**
 * Active vendor profiles, reduced to the 1099/W-9-relevant fields the API
 * exposes. TaxIdentifier is write-only in the Accounting API (verified: never
 * returned on reads), so tax-ID presence cannot be checked here.
 */
export async function fetchVendorProfiles(realmId: string): Promise<VendorProfile[]> {
  const vendors: QboVendor[] = [];
  for (let start = 1; ; start += PAGE_SIZE) {
    const res = await qboFetch<VendorQueryResponse>(realmId, '/query', {
      query: `SELECT * FROM Vendor WHERE Active = true STARTPOSITION ${start} MAXRESULTS ${PAGE_SIZE}`,
    });
    const page = res.QueryResponse.Vendor ?? [];
    vendors.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return vendors.map((v) => ({
    id: v.Id,
    name: v.DisplayName,
    tracked1099: v.Vendor1099 === true,
    hasAddress: Boolean(v.BillAddr && (v.BillAddr.Line1 || v.BillAddr.City)),
    hasEmail: Boolean(v.PrimaryEmailAddr?.Address),
  }));
}
