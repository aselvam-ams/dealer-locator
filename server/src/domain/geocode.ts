import type { LatLng } from './geo.js';
import { pool } from '../db/pool.js';

// Mock geocoder (spec FR-8a — postcode search). A small AU centroid table
// covers the seeded metros; otherwise we fall back to the average coordinate
// of known locations in that postcode. A real geocoding service is a drop-in.
const POSTCODE_CENTROIDS: Record<string, LatLng> = {
  '2000': { latitude: -33.8688, longitude: 151.2093 }, // Sydney
  '2150': { latitude: -33.815, longitude: 151.0011 }, // Parramatta
  '2170': { latitude: -33.92, longitude: 150.9286 }, // Liverpool
  '3000': { latitude: -37.8136, longitude: 144.9631 }, // Melbourne
  '3121': { latitude: -37.8231, longitude: 144.999 }, // Richmond
  '4000': { latitude: -27.4698, longitude: 153.0251 }, // Brisbane
  '5000': { latitude: -34.9285, longitude: 138.6007 }, // Adelaide
  '6000': { latitude: -31.9523, longitude: 115.8613 }, // Perth
};

export async function resolveIncident(req: {
  latitude?: number;
  longitude?: number;
  postcode?: string;
  address?: string;
}): Promise<LatLng> {
  if (typeof req.latitude === 'number' && typeof req.longitude === 'number') {
    return { latitude: req.latitude, longitude: req.longitude };
  }
  if (req.postcode) {
    const known = POSTCODE_CENTROIDS[req.postcode];
    if (known) return known;
    const r = await pool.query(
      `SELECT AVG(latitude) AS lat, AVG(longitude) AS lng
         FROM location WHERE postcode = $1`,
      [req.postcode],
    );
    if (r.rows[0]?.lat != null) {
      return { latitude: Number(r.rows[0].lat), longitude: Number(r.rows[0].lng) };
    }
    throw new Error(`Unable to geocode postcode ${req.postcode}`);
  }
  if (req.address) {
    // Mock: try to pull a 4-digit postcode out of the free-text address.
    const m = req.address.match(/\b(\d{4})\b/);
    if (m && POSTCODE_CENTROIDS[m[1]]) return POSTCODE_CENTROIDS[m[1]];
    throw new Error('Mock geocoder could not resolve address; include a known postcode.');
  }
  throw new Error('Provide latitude/longitude, postcode, or address.');
}
