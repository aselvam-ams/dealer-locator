import type { LatLng } from '../../domain/geo.js';
import { haversineKm } from '../../domain/geo.js';
import { config } from '../../config.js';

export interface DriveResult {
  distance_km: number;
  drive_time_minutes: number;
}

/**
 * Routing provider (spec FR-7 stage 3 / Section 9.1). Called only on the
 * PostGIS-filtered shortlist. The mock is deterministic; a real Google Routes
 * implementation is a drop-in replacement.
 */
export interface RoutingProvider {
  getDriveTimes(origin: LatLng, destinations: LatLng[]): Promise<DriveResult[]>;
}

/** Deterministic mock: derives drive time from straight-line distance. */
export class MockGoogleRoutes implements RoutingProvider {
  async getDriveTimes(origin: LatLng, destinations: LatLng[]): Promise<DriveResult[]> {
    return destinations.map((d) => {
      const straight = haversineKm(origin, d);
      // Road distance ~1.3x straight line; urban avg ~40 km/h incl. a small
      // deterministic "traffic" wobble keyed off coordinates (no Math.random).
      const distance_km = round1(straight * 1.3);
      const trafficFactor = 1 + ((Math.abs(d.latitude * 100) % 7) / 100); // 1.00–1.06
      const drive_time_minutes = Math.max(
        1,
        Math.round((distance_km / 40) * 60 * trafficFactor),
      );
      return { distance_km, drive_time_minutes };
    });
  }
}

/**
 * Real Google Routes API provider (spec Section 9.1). Uses the Route Matrix
 * endpoint with traffic-aware routing, on the PostGIS-filtered shortlist only.
 * Falls back to a straight-line estimate for any pair Google can't route, so a
 * single bad coordinate never fails the whole search. A short in-memory cache
 * de-dupes identical incident→shortlist calls (spec §9.1 caching note).
 */
export class GoogleRoutesProvider implements RoutingProvider {
  private static cache = new Map<string, { at: number; results: DriveResult[] }>();
  private static readonly TTL_MS = 60_000;

  constructor(private readonly apiKey: string) {}

  async getDriveTimes(origin: LatLng, destinations: LatLng[]): Promise<DriveResult[]> {
    if (destinations.length === 0) return [];

    const key = cacheKey(origin, destinations);
    const hit = GoogleRoutesProvider.cache.get(key);
    if (hit && Date.now() - hit.at < GoogleRoutesProvider.TTL_MS) return hit.results;

    // Straight-line fallback for every destination (used if Google can't route).
    const results: DriveResult[] = destinations.map((d) => estimate(origin, d));

    try {
      const res = await fetch(
        'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition',
          },
          body: JSON.stringify({
            origins: [{ waypoint: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } } }],
            destinations: destinations.map((d) => ({
              waypoint: { location: { latLng: { latitude: d.latitude, longitude: d.longitude } } },
            })),
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE',
          }),
        },
      );
      if (!res.ok) throw new Error(`Google Routes ${res.status}: ${await res.text()}`);
      const elements = (await res.json()) as Array<{
        destinationIndex?: number;
        duration?: string;
        distanceMeters?: number;
        condition?: string;
      }>;
      for (const el of elements) {
        if (el.destinationIndex == null) continue;
        if (el.condition === 'ROUTE_EXISTS' && el.duration && el.distanceMeters != null) {
          const seconds = parseInt(el.duration.replace('s', ''), 10);
          results[el.destinationIndex] = {
            distance_km: round1(el.distanceMeters / 1000),
            drive_time_minutes: Math.max(1, Math.round(seconds / 60)),
          };
        }
      }
    } catch (err) {
      // Keep the straight-line estimates rather than failing the search.
      console.warn('Google Routes call failed, using straight-line estimate:', (err as Error).message);
    }

    GoogleRoutesProvider.cache.set(key, { at: Date.now(), results });
    return results;
  }
}

function estimate(origin: LatLng, d: LatLng): DriveResult {
  const distance_km = round1(haversineKm(origin, d) * 1.3);
  return { distance_km, drive_time_minutes: Math.max(1, Math.round((distance_km / 40) * 60)) };
}

function cacheKey(origin: LatLng, destinations: LatLng[]): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(origin.latitude)},${r(origin.longitude)}|${destinations
    .map((d) => `${r(d.latitude)},${r(d.longitude)}`)
    .join(';')}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function makeRoutingProvider(): RoutingProvider {
  return config.googleMapsApiKey
    ? new GoogleRoutesProvider(config.googleMapsApiKey)
    : new MockGoogleRoutes();
}
