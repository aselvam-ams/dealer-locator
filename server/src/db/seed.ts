import bcrypt from 'bcryptjs';
import type { OpeningHours, Role, ServiceCapability } from '@dealer/shared';
import { pool, withTransaction } from './pool.js';
import { makeField } from '../domain/provenance.js';
import { MockChargingSync } from '../adapters/charging/index.js';

const alwaysOpen: OpeningHours = {
  timezone: 'Australia/Sydney',
  days: {
    mon: { open: '00:00', close: '23:59' },
    tue: { open: '00:00', close: '23:59' },
    wed: { open: '00:00', close: '23:59' },
    thu: { open: '00:00', close: '23:59' },
    fri: { open: '00:00', close: '23:59' },
    sat: { open: '00:00', close: '23:59' },
    sun: { open: '00:00', close: '23:59' },
  },
};

function business(tz: string): OpeningHours {
  const wd = { open: '08:00', close: '17:30' };
  const sat = { open: '09:00', close: '13:00' };
  const closed = { open: null, close: null };
  return { timezone: tz, days: { mon: wd, tue: wd, wed: wd, thu: wd, fri: wd, sat, sun: closed } };
}

interface SeedLoc {
  ref: string;
  name: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  lat: number;
  lng: number;
  phone: string;
  email: string;
  ev: boolean;
  caps: ServiceCapability[];
  salesOnly?: boolean;
  hidden?: boolean;
  hours?: OpeningHours;
  types: string[]; // location-type names within tenant
}

const TZ = {
  NSW: 'Australia/Sydney',
  VIC: 'Australia/Melbourne',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  WA: 'Australia/Perth',
};

async function main() {
  await withTransaction(async (client) => {
    console.log('Clearing existing data...');
    await client.query(`TRUNCATE journal, change_register_run RESTART IDENTITY`);
    await client.query(
      `TRUNCATE location_location_type, access_restriction, stop_tow,
                location, location_type, app_user, charging_station, tenant
       RESTART IDENTITY CASCADE`,
    );

    // --- Tenants -----------------------------------------------------------
    const tenants: Record<string, string> = {};
    for (const [name, mode, active, country] of [
      ['Ford', 'api', true, 'AU'],
      ['Mazda', 'api', true, 'AU'],
      ['Mitsubishi', 'sftp', true, 'AU'],
      ['NZ (reserved)', 'manual', false, 'NZ'],
    ] as const) {
      const r = await client.query(
        `INSERT INTO tenant (name, integration_mode, active, country)
         VALUES ($1,$2,$3,$4) RETURNING tenant_id`,
        [name, mode, active, country],
      );
      tenants[name] = r.rows[0].tenant_id;
    }

    // --- Location types ----------------------------------------------------
    const typeIds: Record<string, Record<string, string>> = {};
    const typesByTenant: Record<string, string[]> = {
      Ford: ['Dealer', 'Service Centre'],
      Mazda: ['Dealer', 'Service Centre'],
      // Mitsubishi variant handling (spec FR-2): not all dealers handle all types
      Mitsubishi: ['Passenger Dealer', 'Commercial Dealer', 'Service Centre'],
    };
    for (const [tname, types] of Object.entries(typesByTenant)) {
      typeIds[tname] = {};
      for (const t of types) {
        const r = await client.query(
          `INSERT INTO location_type (tenant_id, name) VALUES ($1,$2) RETURNING location_type_id`,
          [tenants[tname], t],
        );
        typeIds[tname][t] = r.rows[0].location_type_id;
      }
    }

    // --- Locations ---------------------------------------------------------
    const dealerData: Record<string, SeedLoc[]> = {
      Ford: [
        loc('FORD-SYD-01', 'Ford Sydney City', '100 William St', 'Sydney', 'NSW', '2000', -33.8731, 151.2205, true, ['ICE', 'HEV', 'BEV', 'Metro'], ['Dealer', 'Service Centre']),
        loc('FORD-SYD-02', 'Ford Parramatta', '20 Church St', 'Parramatta', 'NSW', '2150', -33.8150, 151.0011, false, ['ICE', 'HEV', 'Metro'], ['Dealer', 'Service Centre']),
        loc('FORD-SYD-03', 'Ford Liverpool Service', '5 Bigge St', 'Liverpool', 'NSW', '2170', -33.9200, 150.9286, true, ['ICE', 'BEV', 'Auto24'], ['Service Centre']),
        loc('FORD-MEL-01', 'Ford Melbourne CBD', '300 Lonsdale St', 'Melbourne', 'VIC', '3000', -37.8120, 144.9620, true, ['ICE', 'BEV', 'HEV', 'Metro'], ['Dealer'], { tz: TZ.VIC }),
        loc('FORD-MEL-02', 'Ford Richmond', '450 Bridge Rd', 'Richmond', 'VIC', '3121', -37.8231, 144.9990, false, ['ICE', 'Metro'], ['Dealer', 'Service Centre'], { tz: TZ.VIC }),
        loc('FORD-BNE-01', 'Ford Brisbane City', '88 Ann St', 'Brisbane', 'QLD', '4000', -27.4670, 153.0270, true, ['ICE', 'BEV'], ['Dealer'], { tz: TZ.QLD }),
        loc('FORD-PER-01', 'Ford Perth Sales', '12 Hay St', 'Perth', 'WA', '6000', -31.9540, 115.8600, false, ['ICE'], ['Dealer'], { tz: TZ.WA, salesOnly: true }),
        loc('FORD-ADL-01', 'Ford Adelaide', '40 Grenfell St', 'Adelaide', 'SA', '5000', -34.9285, 138.6010, true, ['ICE', 'BEV', 'HEV'], ['Dealer', 'Service Centre'], { tz: TZ.SA }),
        loc('FORD-SYD-04', 'Ford North Sydney (hidden)', '1 Miller St', 'North Sydney', 'NSW', '2060', -33.8390, 151.2070, false, ['ICE'], ['Dealer'], { hidden: true }),
        loc('FORD-SYD-05', 'Ford Bondi (business hrs)', '2 Campbell Pde', 'Bondi Beach', 'NSW', '2026', -33.8908, 151.2743, false, ['ICE', 'Metro'], ['Service Centre'], { businessHours: true }),
      ],
      Mazda: [
        loc('MAZDA-SYD-01', 'Mazda Sydney City', '200 George St', 'Sydney', 'NSW', '2000', -33.8650, 151.2090, true, ['ICE', 'HEV', 'BEV', 'Metro'], ['Dealer', 'Service Centre']),
        loc('MAZDA-SYD-02', 'Mazda Chatswood', '15 Victoria Ave', 'Chatswood', 'NSW', '2067', -33.7970, 151.1800, true, ['ICE', 'BEV'], ['Dealer']),
        loc('MAZDA-SYD-03', 'Mazda Liverpool', '30 Macquarie St', 'Liverpool', 'NSW', '2170', -33.9210, 150.9250, false, ['ICE', 'HEV'], ['Service Centre']),
        loc('MAZDA-MEL-01', 'Mazda Melbourne', '500 Elizabeth St', 'Melbourne', 'VIC', '3000', -37.8080, 144.9590, true, ['ICE', 'BEV', 'HEV', 'Auto24'], ['Dealer', 'Service Centre'], { tz: TZ.VIC }),
        loc('MAZDA-MEL-02', 'Mazda Richmond', '600 Swan St', 'Richmond', 'VIC', '3121', -37.8260, 145.0030, false, ['ICE', 'Metro'], ['Dealer'], { tz: TZ.VIC }),
        loc('MAZDA-BNE-01', 'Mazda Brisbane', '120 Edward St', 'Brisbane', 'QLD', '4000', -27.4710, 153.0230, true, ['ICE', 'BEV'], ['Dealer', 'Service Centre'], { tz: TZ.QLD }),
        loc('MAZDA-PER-01', 'Mazda Perth', '50 Murray St', 'Perth', 'WA', '6000', -31.9510, 115.8620, true, ['ICE', 'BEV'], ['Dealer'], { tz: TZ.WA }),
        loc('MAZDA-ADL-01', 'Mazda Adelaide', '70 Rundle Mall', 'Adelaide', 'SA', '5000', -34.9220, 138.6000, false, ['ICE'], ['Dealer'], { tz: TZ.SA }),
        loc('MAZDA-SYD-04', 'Mazda Penrith', '80 High St', 'Penrith', 'NSW', '2750', -33.7510, 150.6940, false, ['ICE', 'HEV'], ['Service Centre']),
        loc('MAZDA-SYD-05', 'Mazda Olympic Park', '10 Olympic Blvd', 'Sydney Olympic Park', 'NSW', '2127', -33.8470, 151.0670, true, ['ICE', 'BEV', 'Auto24'], ['Dealer', 'Service Centre']),
      ],
      Mitsubishi: [
        loc('MITS-SYD-01', 'Mitsubishi Sydney', '300 Pitt St', 'Sydney', 'NSW', '2000', -33.8760, 151.2070, true, ['ICE', 'BEV', 'Metro'], ['Passenger Dealer', 'Service Centre']),
        loc('MITS-SYD-02', 'Mitsubishi Bankstown', '40 North Terrace', 'Bankstown', 'NSW', '2200', -33.9180, 151.0350, false, ['ICE', 'HEV'], ['Passenger Dealer']),
        loc('MITS-SYD-03', 'Mitsubishi Commercial Western Sydney', '5 Stennett Rd', 'Ingleburn', 'NSW', '2565', -33.9970, 150.8650, true, ['ICE', 'BEV'], ['Commercial Dealer', 'Service Centre']),
        loc('MITS-MEL-01', 'Mitsubishi Melbourne', '700 Spencer St', 'West Melbourne', 'VIC', '3003', -37.8090, 144.9450, true, ['ICE', 'BEV', 'HEV'], ['Passenger Dealer', 'Service Centre'], { tz: TZ.VIC }),
        loc('MITS-MEL-02', 'Mitsubishi Dandenong Commercial', '10 Frankston Rd', 'Dandenong', 'VIC', '3175', -37.9870, 145.2150, false, ['ICE'], ['Commercial Dealer'], { tz: TZ.VIC }),
        loc('MITS-BNE-01', 'Mitsubishi Brisbane', '150 Wickham St', 'Fortitude Valley', 'QLD', '4006', -27.4570, 153.0340, true, ['ICE', 'BEV'], ['Passenger Dealer'], { tz: TZ.QLD }),
        loc('MITS-PER-01', 'Mitsubishi Perth', '60 Wellington St', 'Perth', 'WA', '6000', -31.9530, 115.8590, false, ['ICE', 'HEV'], ['Passenger Dealer', 'Service Centre'], { tz: TZ.WA }),
        loc('MITS-ADL-01', 'Mitsubishi Adelaide', '90 King William St', 'Adelaide', 'SA', '5000', -34.9270, 138.5990, true, ['ICE', 'BEV'], ['Passenger Dealer'], { tz: TZ.SA }),
        loc('MITS-SYD-04', 'Mitsubishi Parramatta', '25 Smith St', 'Parramatta', 'NSW', '2150', -33.8170, 151.0050, false, ['ICE', 'Metro'], ['Passenger Dealer', 'Service Centre']),
        loc('MITS-SYD-05', 'Mitsubishi Liverpool Sales', '35 Moore St', 'Liverpool', 'NSW', '2170', -33.9230, 150.9270, false, ['ICE'], ['Passenger Dealer'], { salesOnly: true }),
      ],
    };

    const locationIds: Record<string, string> = {};
    for (const [tname, locs] of Object.entries(dealerData)) {
      for (const l of locs) {
        const id = await insertLocation(client, tenants[tname], l);
        locationIds[l.ref] = id;
        for (const typeName of l.types) {
          await client.query(
            `INSERT INTO location_location_type (location_id, location_type_id) VALUES ($1,$2)`,
            [id, typeIds[tname][typeName]],
          );
        }
      }
    }

    // --- An example access restriction + an example Stop Tow ---------------
    await client.query(
      `INSERT INTO access_restriction (location_id, type, description, alternate_option, active)
       VALUES ($1,'roadworks','Bridge Rd closed for roadworks until further notice','Use Ford Melbourne CBD instead',TRUE)`,
      [locationIds['FORD-MEL-02']],
    );
    await client.query(
      `UPDATE stop_tow SET enabled = TRUE, reason = 'Workshop at capacity', set_at = now()
        WHERE location_id = $1`,
      [locationIds['MAZDA-SYD-02']],
    );
    // Lock example: OEM-locked Mazda Sydney City (dealer cannot toggle)
    await client.query(
      `UPDATE stop_tow SET locked_by_oem = TRUE WHERE location_id = $1`,
      [locationIds['MAZDA-SYD-01']],
    );

    // --- Charging stations (mock periodic sync) ----------------------------
    const stations = await new MockChargingSync().fetchStations();
    for (const s of stations) {
      await client.query(
        `INSERT INTO charging_station
           (provider, external_ref, name, latitude, longitude, geom, truck_accessible)
         VALUES ($1,$2,$3,$4,$5, ST_SetSRID(ST_MakePoint($5,$4),4326)::geography, $6)`,
        [s.provider, s.external_ref, s.name, s.latitude, s.longitude, s.truck_accessible],
      );
    }

    // --- Users (one per role) ---------------------------------------------
    const pwHash = await bcrypt.hash('password123', 10);
    const users: Array<{
      email: string;
      role: Role;
      tenant?: string;
      location?: string;
      entitlements?: string[];
    }> = [
      { email: 'admin@ams.local', role: 'admin' },
      { email: 'power@ams.local', role: 'ams_power_user' },
      { email: 'consultant@ams.local', role: 'consultant', entitlements: ['Ford', 'Mazda', 'Mitsubishi'] },
      { email: 'provider@nationwide.local', role: 'service_provider', entitlements: ['Ford'] },
      { email: 'oem@mazda.local', role: 'oem_office', tenant: 'Mazda' },
      { email: 'dealer@mazda.local', role: 'dealer', tenant: 'Mazda', location: 'MAZDA-SYD-02' },
      { email: 'dealer.locked@mazda.local', role: 'dealer', tenant: 'Mazda', location: 'MAZDA-SYD-01' },
    ];
    for (const u of users) {
      const entitlementIds = (u.entitlements ?? []).map((t) => tenants[t]);
      await client.query(
        `INSERT INTO app_user (email, password_hash, role, tenant_id, location_id, entitlements)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          u.email,
          pwHash,
          u.role,
          u.tenant ? tenants[u.tenant] : null,
          u.location ? locationIds[u.location] : null,
          entitlementIds,
        ],
      );
    }

    console.log('\nSeed complete. Demo accounts (password: password123):');
    for (const u of users) console.log(`  ${u.role.padEnd(16)} ${u.email}`);
  });
  await pool.end();
}

function loc(
  ref: string,
  name: string,
  address: string,
  suburb: string,
  state: string,
  postcode: string,
  lat: number,
  lng: number,
  ev: boolean,
  caps: ServiceCapability[],
  types: string[],
  opts: { tz?: string; salesOnly?: boolean; hidden?: boolean; businessHours?: boolean } = {},
): SeedLoc {
  const tz = opts.tz ?? TZ.NSW;
  return {
    ref,
    name,
    address,
    suburb,
    state,
    postcode,
    lat,
    lng,
    phone: '+61 2 9000 0000',
    email: `${ref.toLowerCase()}@dealer.example`,
    ev,
    caps,
    salesOnly: opts.salesOnly,
    hidden: opts.hidden,
    hours: opts.businessHours ? business(tz) : { ...alwaysOpen, timezone: tz },
    types,
  };
}

async function insertLocation(client: any, tenantId: string, l: SeedLoc): Promise<string> {
  const f = (v: unknown) => JSON.stringify(makeField(v, 'oem'));
  const r = await client.query(
    `INSERT INTO location
       (tenant_id, external_ref, name, address, phone, email, opening_hours,
        ev_certified, service_capabilities, suburb, state, postcode, country,
        latitude, longitude, geom, is_sales_only, is_hidden)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'AU',$13,$14,
             ST_SetSRID(ST_MakePoint($14,$13),4326)::geography,$15,$16)
     RETURNING location_id`,
    [
      tenantId,
      l.ref,
      f(l.name),
      f(l.address),
      f(l.phone),
      f(l.email),
      f(l.hours),
      f(l.ev),
      f(l.caps),
      l.suburb,
      l.state,
      l.postcode,
      l.lat,
      l.lng,
      l.salesOnly ?? false,
      l.hidden ?? false,
    ],
  );
  const id = r.rows[0].location_id as string;
  await client.query(`INSERT INTO stop_tow (location_id, enabled) VALUES ($1, FALSE)`, [id]);
  return id;
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
