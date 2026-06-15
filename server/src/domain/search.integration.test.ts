import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../db/pool.js';
import { proximitySearch } from './search.js';

// Integration test against the seeded DB. Skipped automatically when the DB
// is unreachable (e.g. `docker compose up` / migrate / seed not run).
let dbReady = false;
let mazdaId = '';

beforeAll(async () => {
  try {
    const r = await pool.query(`SELECT tenant_id FROM tenant WHERE name = 'Mazda' LIMIT 1`);
    if (r.rowCount) {
      mazdaId = r.rows[0].tenant_id;
      dbReady = true;
    }
  } catch {
    dbReady = false;
  }
});

afterAll(async () => {
  if (dbReady) await pool.end();
});

describe.skipIf(!process.env.RUN_DB_TESTS)('proximity search (integration)', () => {
  it('returns at most 5 results ranked by drive time', async () => {
    if (!dbReady) return;
    const res = await proximitySearch({
      tenant_id: mazdaId,
      postcode: '2000',
      high_voltage_fault: 'no',
      tow_context: true,
    });
    expect(res.results.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < res.results.length; i++) {
      expect(res.results[i].drive_time_minutes).toBeGreaterThanOrEqual(
        res.results[i - 1].drive_time_minutes,
      );
    }
  });

  it('high-voltage fault filters to EV-certified dealers only', async () => {
    if (!dbReady) return;
    const res = await proximitySearch({
      tenant_id: mazdaId,
      postcode: '2000',
      high_voltage_fault: 'yes',
      tow_context: true,
    });
    expect(res.results.every((r) => r.ev_certified)).toBe(true);
  });

  it('includes nearby charging stations', async () => {
    if (!dbReady) return;
    const res = await proximitySearch({
      tenant_id: mazdaId,
      postcode: '2000',
      high_voltage_fault: 'no',
    });
    expect(res.charging_stations.length).toBeGreaterThan(0);
  });

  it('charge-only tow returns charging stations ranked by drive time, no dealers', async () => {
    if (!dbReady) return;
    const res = await proximitySearch({
      tenant_id: mazdaId,
      latitude: -33.8688,
      longitude: 151.2093,
      high_voltage_fault: 'no',
      destination: 'charging',
    });
    expect(res.destination).toBe('charging');
    expect(res.results.length).toBe(0);
    expect(res.charging_stations.length).toBeGreaterThan(0);
    for (let i = 1; i < res.charging_stations.length; i++) {
      expect(res.charging_stations[i].drive_time_minutes!).toBeGreaterThanOrEqual(
        res.charging_stations[i - 1].drive_time_minutes!,
      );
    }
  });
});
