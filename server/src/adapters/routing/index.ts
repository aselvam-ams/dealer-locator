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
 * Stub for the real Google Routes API (spec Section 9.1). Wired only when a
 * server-side key is configured. Not exercised in the MVP.
 */
export class GoogleRoutesProvider implements RoutingProvider {
  constructor(private readonly apiKey: string) {}
  async getDriveTimes(): Promise<DriveResult[]> {
    throw new Error(
      'GoogleRoutesProvider not implemented in MVP — set GOOGLE_MAPS_API_KEY only when wiring the real Routes API.',
    );
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function makeRoutingProvider(): RoutingProvider {
  return config.googleMapsApiKey
    ? new GoogleRoutesProvider(config.googleMapsApiKey)
    : new MockGoogleRoutes();
}
