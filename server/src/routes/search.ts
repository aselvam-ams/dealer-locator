import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SearchRequest } from '@dealer/shared';
import { pool } from '../db/pool.js';
import { authenticate, assertTenant, canAccessTenant } from '../auth/guards.js';
import { requireCapability } from '../auth/guards.js';
import { proximitySearch } from '../domain/search.js';
import { getLocation } from '../domain/locationRepo.js';

const searchSchema = z.object({
  tenant_id: z.string().uuid(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  postcode: z.string().optional(),
  address: z.string().optional(),
  high_voltage_fault: z.enum(['yes', 'no', 'unknown']).default('unknown'),
  location_type_id: z.string().uuid().optional(),
  exclude_sales_only: z.boolean().optional(),
  tow_context: z.boolean().optional(),
});

export async function searchRoutes(app: FastifyInstance) {
  // Tenants visible to the caller (for UI dropdowns), scoped by entitlement.
  app.get('/api/tenants', { preHandler: [authenticate] }, async (req) => {
    const r = await pool.query(
      `SELECT tenant_id, name, country, active, integration_mode FROM tenant
        WHERE active = TRUE ORDER BY name`,
    );
    return r.rows.filter((t) => canAccessTenant(req.user!, t.tenant_id));
  });

  app.get('/api/tenants/:id/location-types', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!assertTenant(req.user!, id, reply)) return;
    const r = await pool.query(
      `SELECT location_type_id, name, description FROM location_type
        WHERE tenant_id = $1 ORDER BY name`,
      [id],
    );
    return r.rows;
  });

  app.post(
    '/api/search',
    { preHandler: [authenticate, requireCapability('search')] },
    async (req, reply) => {
      const parsed = searchSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const body = parsed.data as SearchRequest;
      if (!assertTenant(req.user!, body.tenant_id, reply)) return;
      try {
        return await proximitySearch(body);
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  // Dealer detail — also the server-to-server query API for Salesforce (spec 6.3).
  app.get(
    '/api/locations/:id',
    { preHandler: [authenticate, requireCapability('search')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const loc = await getLocation(id);
      if (!loc) return reply.code(404).send({ error: 'Not found' });
      if (!assertTenant(req.user!, loc.tenant_id, reply)) return;
      return loc;
    },
  );
}
