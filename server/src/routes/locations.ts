import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ProvenanceSource, Role } from '@dealer/shared';
import { authenticate, assertTenant, requireCapability } from '../auth/guards.js';
import {
  getLocation,
  listByTenant,
  updateLocationFields,
  getLocationHistory,
  type FieldUpdates,
} from '../domain/locationRepo.js';

/** Provenance source implied by the editor's role (spec Section 7.2). */
function sourceForRole(role: Role): ProvenanceSource {
  if (role === 'dealer') return 'dealer';
  if (role === 'oem_office') return 'oem';
  return 'ams'; // admin / ams_power_user override (locks the field)
}

// Dealers may only self-serve a subset of fields (spec Section 5).
const DEALER_ALLOWED = new Set(['phone', 'email', 'opening_hours']);

const updateSchema = z.object({
  provenance: z.record(z.string(), z.unknown()).optional(),
  plain: z
    .object({ is_sales_only: z.boolean().optional(), is_hidden: z.boolean().optional() })
    .optional(),
});

export async function locationRoutes(app: FastifyInstance) {
  // OEM Office / AMS: list a tenant's dealers for management.
  app.get(
    '/api/tenants/:id/locations',
    { preHandler: [authenticate, requireCapability('manage_tenant_dealers')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!assertTenant(req.user!, id, reply)) return;
      return listByTenant(id);
    },
  );

  app.get(
    '/api/locations/:id/history',
    { preHandler: [authenticate, requireCapability('search')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const loc = await getLocation(id);
      if (!loc) return reply.code(404).send({ error: 'Not found' });
      if (!assertTenant(req.user!, loc.tenant_id, reply)) return;
      return getLocationHistory(id);
    },
  );

  // Update dealer fields (dealer self-serve, OEM Office, or AMS override).
  app.patch(
    '/api/locations/:id',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const user = req.user!;
      const { id } = req.params as { id: string };
      const loc = await getLocation(id);
      if (!loc) return reply.code(404).send({ error: 'Not found' });
      if (!assertTenant(user, loc.tenant_id, reply)) return;

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      // Role-based field restrictions.
      if (user.role === 'dealer') {
        if (user.location_id !== id) {
          return reply.code(403).send({ error: 'Dealers may only edit their own location' });
        }
        const fields = Object.keys(parsed.data.provenance ?? {});
        if (fields.some((f) => !DEALER_ALLOWED.has(f)) || parsed.data.plain) {
          return reply.code(403).send({ error: 'Dealers may only edit phone, email and opening hours' });
        }
      } else if (!['admin', 'ams_power_user', 'oem_office'].includes(user.role)) {
        return reply.code(403).send({ error: 'Not permitted to edit locations' });
      }

      const updated = await updateLocationFields(
        id,
        parsed.data as FieldUpdates,
        sourceForRole(user.role),
        { userId: user.user_id, role: user.role },
      );
      return updated;
    },
  );
}
