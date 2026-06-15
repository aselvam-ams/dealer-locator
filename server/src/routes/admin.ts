import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { authenticate, assertTenant, requireCapability } from '../auth/guards.js';
import { writeJournal } from '../domain/journal.js';
import { makeChargingSync } from '../adapters/charging/index.js';

const tenantCreateSchema = z.object({
  name: z.string().min(1),
  country: z.enum(['AU', 'NZ']).default('AU'),
  active: z.boolean().default(true),
  integration_mode: z.enum(['api', 'sftp', 'manual']).default('manual'),
});

const tenantUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
  integration_mode: z.enum(['api', 'sftp', 'manual']).optional(),
});

export async function adminRoutes(app: FastifyInstance) {
  // ---- Tenant management (Admin) ----------------------------------------
  app.get('/api/admin/tenants', { preHandler: [authenticate, requireCapability('manage_tenants')] }, async () => {
    const r = await pool.query(
      `SELECT t.*, (SELECT count(*) FROM location l WHERE l.tenant_id = t.tenant_id)::int AS location_count
         FROM tenant t ORDER BY t.name`,
    );
    return r.rows;
  });

  app.post('/api/admin/tenants', { preHandler: [authenticate, requireCapability('manage_tenants')] }, async (req, reply) => {
    const parsed = tenantCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const b = parsed.data;
    const r = await pool.query(
      `INSERT INTO tenant (name, country, active, integration_mode) VALUES ($1,$2,$3,$4) RETURNING *`,
      [b.name, b.country, b.active, b.integration_mode],
    );
    await writeJournal({
      entityType: 'tenant', entityId: r.rows[0].tenant_id, tenantId: r.rows[0].tenant_id,
      action: 'tenant.create', newValue: b, actorUserId: req.user!.user_id, actorRole: req.user!.role,
    });
    return reply.code(201).send(r.rows[0]);
  });

  app.patch('/api/admin/tenants/:id', { preHandler: [authenticate, requireCapability('manage_tenants')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = tenantUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const sets: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const [k, v] of Object.entries(parsed.data)) {
      sets.push(`${k} = $${p++}`);
      params.push(v);
    }
    if (!sets.length) return reply.code(400).send({ error: 'No changes' });
    sets.push('updated_at = now()');
    params.push(id);
    const r = await pool.query(`UPDATE tenant SET ${sets.join(', ')} WHERE tenant_id = $${p} RETURNING *`, params);
    if (!r.rowCount) return reply.code(404).send({ error: 'Not found' });
    await writeJournal({
      entityType: 'tenant', entityId: id, tenantId: id, action: 'tenant.update',
      newValue: parsed.data, actorUserId: req.user!.user_id, actorRole: req.user!.role,
    });
    return r.rows[0];
  });

  // ---- Audit log viewer (global Journal) --------------------------------
  app.get('/api/admin/journal', { preHandler: [authenticate, requireCapability('view_audit')] }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const where: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    // Power Users / Admins are cross-tenant; still allow narrowing by tenant.
    if (q.tenant_id) {
      if (!assertTenant(req.user!, q.tenant_id, reply)) return;
      where.push(`tenant_id = $${p++}`); params.push(q.tenant_id);
    }
    if (q.entity_type) { where.push(`entity_type = $${p++}`); params.push(q.entity_type); }
    if (q.action) { where.push(`action = $${p++}`); params.push(q.action); }
    if (q.actor_role) { where.push(`actor_role = $${p++}`); params.push(q.actor_role); }
    if (q.from) { where.push(`occurred_at >= $${p++}`); params.push(q.from); }
    if (q.to) { where.push(`occurred_at <= $${p++}`); params.push(q.to); }

    const limit = Math.min(Number(q.limit ?? 200), 1000);
    const r = await pool.query(
      `SELECT * FROM journal
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY occurred_at DESC, journal_id DESC LIMIT ${limit}`,
      params,
    );
    return r.rows;
  });

  // ---- Charging-station sync (Chargefox / PlugShare, periodic) ----------
  app.post('/api/admin/charging/sync', { preHandler: [authenticate, requireCapability('sync_charging')] }, async (req) => {
    const stations = await makeChargingSync().fetchStations();
    let upserted = 0;
    for (const s of stations) {
      await pool.query(
        `INSERT INTO charging_station
           (provider, external_ref, name, latitude, longitude, geom, truck_accessible, last_synced_at)
         VALUES ($1,$2,$3,$4,$5, ST_SetSRID(ST_MakePoint($5,$4),4326)::geography, $6, now())
         ON CONFLICT (provider, external_ref) DO UPDATE
           SET name = EXCLUDED.name, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
               geom = EXCLUDED.geom, truck_accessible = EXCLUDED.truck_accessible, last_synced_at = now()`,
        [s.provider, s.external_ref, s.name, s.latitude, s.longitude, s.truck_accessible],
      );
      upserted++;
    }
    await writeJournal({
      entityType: 'charging_station', entityId: 'sync', action: 'charging.sync',
      newValue: { upserted }, actorUserId: req.user!.user_id, actorRole: req.user!.role,
    });
    return { upserted };
  });

  app.get('/api/admin/charging', { preHandler: [authenticate, requireCapability('search')] }, async () => {
    const r = await pool.query(
      `SELECT station_id, provider, external_ref, name, latitude, longitude, truck_accessible, last_synced_at
         FROM charging_station ORDER BY provider, name`,
    );
    return r.rows;
  });
}
