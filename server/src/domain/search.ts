import type {
  AccessRestriction,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
  ServiceCapability,
  ChargingStation,
} from '@dealer/shared';
import type { ProvenanceField, OpeningHours } from '@dealer/shared';
import { pool } from '../db/pool.js';
import { isOpenAt } from './openingHours.js';
import { isEvEligible } from './evRouting.js';
import { makeRoutingProvider } from '../adapters/routing/index.js';
import { resolveIncident } from './geocode.js';

const CANDIDATE_LIMIT = 20; // PostGIS shortlist before any routing call (FR-7)
const RESULT_LIMIT = 5; // top-N returned (FR-7)

interface CandidateRow {
  location_id: string;
  name: ProvenanceField<string>;
  address: ProvenanceField<string>;
  phone: ProvenanceField<string>;
  ev_certified: ProvenanceField<boolean>;
  service_capabilities: ProvenanceField<ServiceCapability[]>;
  opening_hours: ProvenanceField<OpeningHours>;
  suburb: string;
  state: string;
  postcode: string;
  latitude: number;
  longitude: number;
  is_sales_only: boolean;
  stop_tow: boolean;
}

/**
 * Two-stage proximity search (spec FR-7):
 *   1. PostGIS candidate selection (nearest ~20, tenant-scoped, not hidden).
 *   2. Eligibility filter (open-now, restrictions, EV cert, type, sales-only).
 *   3. Drive-time ranking via routing provider on the survivors only.
 *   4. Return top 5 by drive time, annotated.
 */
export async function proximitySearch(req: SearchRequest, now: Date = new Date()): Promise<SearchResponse> {
  const incident = await resolveIncident(req);
  const towContext = req.tow_context ?? true;

  // --- Stage 1: PostGIS candidate selection -------------------------------
  const typeFilter = req.location_type_id
    ? `AND EXISTS (SELECT 1 FROM location_location_type llt
                   WHERE llt.location_id = l.location_id
                     AND llt.location_type_id = $4)`
    : '';
  const params: unknown[] = [req.tenant_id, incident.longitude, incident.latitude];
  if (req.location_type_id) params.push(req.location_type_id);

  const candidates = await pool.query<CandidateRow>(
    `SELECT l.location_id, l.name, l.address, l.phone, l.ev_certified,
            l.service_capabilities, l.opening_hours, l.suburb, l.state, l.postcode,
            l.latitude, l.longitude, l.is_sales_only,
            COALESCE(st.enabled, FALSE) AS stop_tow
       FROM location l
       LEFT JOIN stop_tow st ON st.location_id = l.location_id
      WHERE l.tenant_id = $1
        AND l.is_hidden = FALSE
        AND l.country = 'AU'            -- AU only in Phase 1 (FR-8d)
        ${typeFilter}
      ORDER BY l.geom <-> ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
      LIMIT ${CANDIDATE_LIMIT}`,
    params,
  );

  const ids = candidates.rows.map((r) => r.location_id);
  const restrictionsByLocation = await loadActiveRestrictions(ids, now);

  // --- Stage 2: eligibility filter ----------------------------------------
  const eligible = candidates.rows.filter((r) => {
    if (req.exclude_sales_only && r.is_sales_only) return false;
    if (!isEvEligible(r.ev_certified.value, req.high_voltage_fault)) return false;
    if (towContext) {
      if (r.stop_tow) return false; // Stop Tow excludes from tow routing
      if (!isOpenAt(r.opening_hours.value, now)) return false;
    }
    return true;
  });

  // --- Stage 3: drive-time ranking (routing provider on survivors only) ---
  const routing = makeRoutingProvider();
  const drive = await routing.getDriveTimes(
    incident,
    eligible.map((r) => ({ latitude: r.latitude, longitude: r.longitude })),
  );

  const items: SearchResultItem[] = eligible
    .map((r, i) => ({
      location_id: r.location_id,
      name: r.name.value,
      address: r.address.value,
      suburb: r.suburb,
      state: r.state,
      postcode: r.postcode,
      phone: r.phone.value,
      latitude: r.latitude,
      longitude: r.longitude,
      distance_km: drive[i].distance_km,
      drive_time_minutes: drive[i].drive_time_minutes,
      ev_certified: r.ev_certified.value,
      service_capabilities: r.service_capabilities.value,
      stop_tow: r.stop_tow,
      restrictions: restrictionsByLocation.get(r.location_id) ?? [],
      is_sales_only: r.is_sales_only,
    }))
    // --- Stage 4: rank by drive time, take top 5 --------------------------
    .sort((a, b) => a.drive_time_minutes - b.drive_time_minutes)
    .slice(0, RESULT_LIMIT);

  const charging = await nearestChargingStations(incident, 5);

  return { incident, results: items, charging_stations: charging };
}

async function loadActiveRestrictions(
  locationIds: string[],
  now: Date,
): Promise<Map<string, AccessRestriction[]>> {
  const map = new Map<string, AccessRestriction[]>();
  if (locationIds.length === 0) return map;
  const r = await pool.query(
    `SELECT * FROM access_restriction
      WHERE location_id = ANY($1::uuid[])
        AND active = TRUE
        AND (valid_from IS NULL OR valid_from <= $2)
        AND (valid_to   IS NULL OR valid_to   >= $2)`,
    [locationIds, now.toISOString()],
  );
  for (const row of r.rows as AccessRestriction[]) {
    const arr = map.get(row.location_id) ?? [];
    arr.push(row);
    map.set(row.location_id, arr);
  }
  return map;
}

export async function nearestChargingStations(
  incident: { latitude: number; longitude: number },
  limit: number,
): Promise<Array<ChargingStation & { distance_km: number }>> {
  const r = await pool.query(
    `SELECT station_id, provider, external_ref, name, latitude, longitude,
            truck_accessible, last_synced_at,
            ST_Distance(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography)/1000 AS distance_km
       FROM charging_station
      ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
      LIMIT $3`,
    [incident.longitude, incident.latitude, limit],
  );
  return r.rows.map((row) => ({
    station_id: row.station_id,
    provider: row.provider,
    external_ref: row.external_ref,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    truck_accessible: row.truck_accessible,
    last_synced_at: row.last_synced_at,
    distance_km: Math.round(row.distance_km * 10) / 10,
  }));
}
