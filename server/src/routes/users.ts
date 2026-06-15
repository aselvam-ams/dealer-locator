import type { FastifyInstance, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { AuthUser, Role } from '@dealer/shared';
import { pool } from '../db/pool.js';
import { authenticate, requireCapability } from '../auth/guards.js';
import { writeJournal } from '../domain/journal.js';

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'ams_power_user', 'consultant', 'service_provider', 'oem_office', 'dealer']),
  tenant_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  entitlements: z.array(z.string().uuid()).optional(),
});

const updateSchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(['admin', 'ams_power_user', 'consultant', 'service_provider', 'oem_office', 'dealer']).optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  entitlements: z.array(z.string().uuid()).optional(),
  password: z.string().min(8).optional(),
});

/**
 * Account provisioning rules (spec Section 5.1):
 *  - Admin / AMS Power User may create or edit ANY account.
 *  - OEM Office may only create/edit DEALER accounts within its OWN tenant, and
 *    each dealer is bound to one location.
 * Returns an error string when not allowed, or null when allowed.
 */
function provisioningError(
  actor: AuthUser,
  target: { role: Role; tenant_id?: string | null; location_id?: string | null },
): string | null {
  if (actor.role === 'admin' || actor.role === 'ams_power_user') return null;
  if (actor.role === 'oem_office') {
    if (target.role !== 'dealer') return 'OEM Office can only manage Dealer accounts';
    if (target.tenant_id !== actor.tenant_id) return 'OEM Office can only manage users in its own tenant';
    if (!target.location_id) return 'A Dealer account must be bound to a location';
    return null;
  }
  return 'Not permitted to manage users';
}

function publicUser(row: any) {
  return {
    user_id: row.user_id,
    email: row.email,
    role: row.role,
    tenant_id: row.tenant_id,
    location_id: row.location_id,
    entitlements: row.entitlements ?? [],
    active: row.active,
    created_at: row.created_at,
  };
}

export async function userRoutes(app: FastifyInstance) {
  // List users — Admin/Power User see all; OEM Office sees its own tenant only.
  app.get('/api/users', { preHandler: [authenticate, requireCapability('manage_users')] }, async (req) => {
    const actor = req.user!;
    const scoped = actor.role === 'oem_office';
    const r = await pool.query(
      `SELECT user_id, email, role, tenant_id, location_id, entitlements, active, created_at
         FROM app_user
        ${scoped ? 'WHERE tenant_id = $1' : ''}
        ORDER BY role, email`,
      scoped ? [actor.tenant_id] : [],
    );
    return r.rows.map(publicUser);
  });

  // Create a user.
  app.post('/api/users', { preHandler: [authenticate, requireCapability('manage_users')] }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    const err = provisioningError(req.user!, body);
    if (err) return reply.code(403).send({ error: err });

    const exists = await pool.query('SELECT 1 FROM app_user WHERE email = $1', [body.email]);
    if (exists.rowCount) return reply.code(409).send({ error: 'Email already in use' });

    const hash = await bcrypt.hash(body.password, 10);
    const r = await pool.query(
      `INSERT INTO app_user (email, password_hash, role, tenant_id, location_id, entitlements, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING user_id, email, role, tenant_id, location_id, entitlements, active, created_at`,
      [
        body.email,
        hash,
        body.role,
        body.tenant_id ?? null,
        body.location_id ?? null,
        body.entitlements ?? [],
        req.user!.user_id,
      ],
    );
    await writeJournal({
      entityType: 'user',
      entityId: r.rows[0].user_id,
      tenantId: body.tenant_id ?? null,
      action: 'user.create',
      newValue: { email: body.email, role: body.role },
      actorUserId: req.user!.user_id,
      actorRole: req.user!.role,
    });
    return reply.code(201).send(publicUser(r.rows[0]));
  });

  // Update a user (activate/deactivate, role, scope, password reset).
  app.patch('/api/users/:id', { preHandler: [authenticate, requireCapability('manage_users')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await pool.query('SELECT * FROM app_user WHERE user_id = $1', [id]);
    if (!existing.rowCount) return reply.code(404).send({ error: 'Not found' });
    const current = existing.rows[0];

    // OEM Office may only touch dealers in its own tenant (current AND resulting state).
    const resulting = {
      role: parsed.data.role ?? current.role,
      tenant_id: parsed.data.tenant_id ?? current.tenant_id,
      location_id: parsed.data.location_id ?? current.location_id,
    };
    if (!guardActor(req.user!, current, reply)) return;
    const err = provisioningError(req.user!, resulting);
    if (err) return reply.code(403).send({ error: err });

    const sets: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (parsed.data.active !== undefined) { sets.push(`active = $${p++}`); params.push(parsed.data.active); }
    if (parsed.data.role !== undefined) { sets.push(`role = $${p++}`); params.push(parsed.data.role); }
    if (parsed.data.tenant_id !== undefined) { sets.push(`tenant_id = $${p++}`); params.push(parsed.data.tenant_id); }
    if (parsed.data.location_id !== undefined) { sets.push(`location_id = $${p++}`); params.push(parsed.data.location_id); }
    if (parsed.data.entitlements !== undefined) { sets.push(`entitlements = $${p++}`); params.push(parsed.data.entitlements); }
    if (parsed.data.password !== undefined) {
      sets.push(`password_hash = $${p++}`);
      params.push(await bcrypt.hash(parsed.data.password, 10));
    }
    if (!sets.length) return reply.code(400).send({ error: 'No changes' });
    params.push(id);
    const r = await pool.query(
      `UPDATE app_user SET ${sets.join(', ')} WHERE user_id = $${p}
       RETURNING user_id, email, role, tenant_id, location_id, entitlements, active, created_at`,
      params,
    );
    await writeJournal({
      entityType: 'user',
      entityId: id,
      tenantId: resulting.tenant_id,
      action: 'user.update',
      newValue: { fields: Object.keys(parsed.data).filter((k) => k !== 'password') },
      actorUserId: req.user!.user_id,
      actorRole: req.user!.role,
    });
    return publicUser(r.rows[0]);
  });
}

// OEM Office can only act on dealers already inside its tenant.
function guardActor(actor: AuthUser, current: any, reply: FastifyReply): boolean {
  if (actor.role === 'oem_office') {
    if (current.role !== 'dealer' || current.tenant_id !== actor.tenant_id) {
      reply.code(403).send({ error: 'OEM Office can only manage Dealer accounts in its own tenant' });
      return false;
    }
  }
  return true;
}
