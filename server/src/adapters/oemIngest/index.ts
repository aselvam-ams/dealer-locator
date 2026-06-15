import type { OpeningHours, ServiceCapability } from '@dealer/shared';

/**
 * Canonical inbound location shape (spec Section 9.2 / constraint #1). Each OEM
 * sends a different format; an adapter normalises it into this schema before
 * the idempotent upsert on (tenant_id, external_ref).
 */
export interface CanonicalLocationInput {
  external_ref: string;
  name: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  latitude: number;
  longitude: number;
  phone: string;
  email: string;
  opening_hours: OpeningHours;
  ev_certified: boolean;
  service_capabilities: ServiceCapability[];
  is_sales_only?: boolean;
  dealer_group_id?: string | null;
}

export interface OemIngestAdapter {
  /** Normalise a raw OEM payload into canonical records. */
  normalise(raw: unknown): CanonicalLocationInput[];
}

/**
 * Example adapter for a "Mazda-style" feed (spec FR-3). Demonstrates mapping a
 * vendor format with differently-named fields and a flat hours string into the
 * canonical schema. Other OEMs get their own adapter implementing the same
 * interface.
 */
export class MazdaSampleAdapter implements OemIngestAdapter {
  normalise(raw: unknown): CanonicalLocationInput[] {
    const payload = raw as { dealers?: MazdaDealer[] };
    const dealers = payload?.dealers ?? [];
    return dealers.map((d) => ({
      external_ref: String(d.DealerCode),
      name: d.DealerName,
      address: d.StreetAddress,
      suburb: d.Suburb,
      state: d.State,
      postcode: String(d.Postcode),
      latitude: d.Lat,
      longitude: d.Lng,
      phone: d.Phone ?? '',
      email: d.Email ?? '',
      opening_hours: defaultHours(d.Timezone ?? 'Australia/Sydney'),
      ev_certified: d.EVCertified === 'Y',
      service_capabilities: mapCaps(d.Capabilities ?? ''),
      is_sales_only: d.SalesOnly === 'Y',
      dealer_group_id: d.GroupCode ?? null,
    }));
  }
}

interface MazdaDealer {
  DealerCode: string | number;
  DealerName: string;
  StreetAddress: string;
  Suburb: string;
  State: string;
  Postcode: string | number;
  Lat: number;
  Lng: number;
  Phone?: string;
  Email?: string;
  Timezone?: string;
  EVCertified?: string;
  SalesOnly?: string;
  Capabilities?: string; // e.g. "BEV;HEV;Metro"
  GroupCode?: string | null;
}

function mapCaps(s: string): ServiceCapability[] {
  const valid: ServiceCapability[] = ['HEV', 'Hybrid', 'BEV', 'ICE', 'Auto24', 'Metro', 'Tyre'];
  return s
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter((x): x is ServiceCapability => (valid as string[]).includes(x));
}

function defaultHours(timezone: string): OpeningHours {
  const weekday = { open: '08:00', close: '17:30' };
  const sat = { open: '09:00', close: '13:00' };
  const closed = { open: null, close: null };
  return {
    timezone,
    days: {
      mon: weekday,
      tue: weekday,
      wed: weekday,
      thu: weekday,
      fri: weekday,
      sat: sat,
      sun: closed,
    },
  };
}
