import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, assertTenant, requireCapability } from '../auth/guards.js';
import { getLocation } from '../domain/locationRepo.js';
import {
  setStopTow,
  setLock,
  bulkByPostcode,
  applyAutoRules,
  Httpish,
} from '../domain/stopTow.js';

const setSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().optional().nullable(),
  auto_rule: z
    .object({ type: z.enum(['date', 'days']), value: z.union([z.string(), z.number()]) })
    .optional()
    .nullable(),
});

const lockSchema = z.object({ locked: z.boolean() });

const bulkSchema = z.object({
  tenant_id: z.string().uuid(),
  postcode: z.string().min(3),
  enabled: z.boolean(),
  reason: z.string().optional().nullable(),
});

function handleHttpish(err: unknown, reply: any) {
  if (err instanceof Httpish) return reply.code(err.status).send({ error: err.message });
  throw err;
}

export async function stopTowRoutes(app: FastifyInstance) {
  // Toggle Stop Tow for one location.
  app.post(
    '/api/locations/:id/stop-tow',
    { preHandler: [authenticate, requireCapability('set_stop_tow')] },
    async (req, reply) => {
      const user = req.user!;
      const { id } = req.params as { id: string };
      const loc = await getLocation(id);
      if (!loc) return reply.code(404).send({ error: 'Not found' });
      if (!assertTenant(user, loc.tenant_id, reply)) return;
      if (user.role === 'dealer' && user.location_id !== id) {
        return reply.code(403).send({ error: 'Dealers may only set Stop Tow on their own location' });
      }
      const parsed = setSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      try {
        return await setStopTow(
          id,
          { enabled: parsed.data.enabled, reason: parsed.data.reason, autoRule: parsed.data.auto_rule },
          { userId: user.user_id, role: user.role },
        );
      } catch (err) {
        return handleHttpish(err, reply);
      }
    },
  );

  // Set / clear the OEM lock.
  app.post(
    '/api/locations/:id/stop-tow/lock',
    { preHandler: [authenticate, requireCapability('lock_stop_tow')] },
    async (req, reply) => {
      const user = req.user!;
      const { id } = req.params as { id: string };
      const loc = await getLocation(id);
      if (!loc) return reply.code(404).send({ error: 'Not found' });
      if (!assertTenant(user, loc.tenant_id, reply)) return;
      const parsed = lockSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      try {
        return await setLock(id, parsed.data.locked, { userId: user.user_id, role: user.role });
      } catch (err) {
        return handleHttpish(err, reply);
      }
    },
  );

  // Bulk Stop Tow by postcode (within a tenant).
  app.post(
    '/api/stop-tow/bulk',
    { preHandler: [authenticate, requireCapability('set_stop_tow')] },
    async (req, reply) => {
      const user = req.user!;
      const parsed = bulkSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      if (!assertTenant(user, parsed.data.tenant_id, reply)) return;
      const count = await bulkByPostcode(
        parsed.data.tenant_id,
        parsed.data.postcode,
        parsed.data.enabled,
        { userId: user.user_id, role: user.role },
        parsed.data.reason,
      );
      return { updated: count };
    },
  );

  // Evaluate date/days auto-rules (intended for a scheduler; on-demand in MVP).
  app.post(
    '/api/stop-tow/apply-auto-rules',
    { preHandler: [authenticate, requireCapability('set_stop_tow')] },
    async () => {
      const flipped = await applyAutoRules();
      return { flipped };
    },
  );
}
