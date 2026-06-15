import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { authenticate, assertTenant, requireCapability } from '../auth/guards.js';
import { buildDelta } from '../domain/changeRegister.js';
import { makeSftpDeliverer } from '../adapters/sftp/index.js';

const runSchema = z.object({
  tenant_id: z.string().uuid(),
  club: z.string().min(1),
  since: z.string().datetime().optional(),
});

export async function changeRegisterRoutes(app: FastifyInstance) {
  // Generate a delta and deliver it to the club's (mock) SFTP folder (spec FR-6).
  app.post(
    '/api/admin/change-register/run',
    { preHandler: [authenticate, requireCapability('change_register')] },
    async (req, reply) => {
      const parsed = runSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const { tenant_id, club, since } = parsed.data;
      if (!assertTenant(req.user!, tenant_id, reply)) return;

      const delta = await buildDelta(tenant_id, since ?? null);
      const fileName = `change-register-${tenant_id}-${delta.window_to.replace(/[:.]/g, '-')}.json`;
      const sftp = makeSftpDeliverer();
      const filePath = await sftp.deliver(club, fileName, JSON.stringify(delta, null, 2));

      const run = await pool.query(
        `INSERT INTO change_register_run
           (tenant_or_club, delta_window_from, delta_window_to, file_path, delivery, status, record_count)
         VALUES ($1,$2,$3,$4,'sftp','delivered',$5)
         RETURNING run_id, generated_at`,
        [club, delta.window_from, delta.window_to, filePath, delta.entries.length],
      );
      return {
        run_id: run.rows[0].run_id,
        generated_at: run.rows[0].generated_at,
        file_path: filePath,
        record_count: delta.entries.length,
        delta,
      };
    },
  );

  app.get(
    '/api/admin/change-register/runs',
    { preHandler: [authenticate, requireCapability('change_register')] },
    async () => {
      const r = await pool.query(
        `SELECT * FROM change_register_run ORDER BY generated_at DESC LIMIT 50`,
      );
      return r.rows;
    },
  );

  // Modern club-facing API path (spec FR-6): same delta over HTTP.
  app.get('/api/club/sync', { preHandler: [authenticate, requireCapability('search')] }, async (req, reply) => {
    const q = req.query as { tenant_id?: string; since?: string };
    if (!q.tenant_id) return reply.code(400).send({ error: 'tenant_id required' });
    if (!assertTenant(req.user!, q.tenant_id, reply)) return;
    return buildDelta(q.tenant_id, q.since ?? null);
  });
}
