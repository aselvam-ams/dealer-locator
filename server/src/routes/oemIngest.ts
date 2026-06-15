import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTransaction } from '../db/pool.js';
import { authenticate, assertTenant, requireCapability } from '../auth/guards.js';
import { upsertCanonical } from '../domain/locationIngest.js';
import { MazdaSampleAdapter, type CanonicalLocationInput } from '../adapters/oemIngest/index.js';

const ingestSchema = z.object({
  tenant_id: z.string().uuid(),
  // 'canonical' = body.records already in canonical shape; otherwise an adapter key.
  format: z.enum(['canonical', 'mazda']).default('canonical'),
  payload: z.unknown(),
});

export async function oemIngestRoutes(app: FastifyInstance) {
  // Inbound OEM API sync (spec FR-3 / 9.2): normalise then idempotent upsert.
  app.post(
    '/api/oem/ingest',
    { preHandler: [authenticate, requireCapability('oem_ingest')] },
    async (req, reply) => {
      const parsed = ingestSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const { tenant_id, format, payload } = parsed.data;
      if (!assertTenant(req.user!, tenant_id, reply)) return;

      let records: CanonicalLocationInput[];
      if (format === 'mazda') {
        records = new MazdaSampleAdapter().normalise(payload);
      } else {
        records = (payload as { records?: CanonicalLocationInput[] })?.records ?? [];
      }
      if (!Array.isArray(records) || records.length === 0) {
        return reply.code(400).send({ error: 'No records to ingest' });
      }

      let created = 0;
      let updated = 0;
      await withTransaction(async (client) => {
        for (const rec of records) {
          // OEM sync writes with source = 'oem' (respects AMS locks).
          const res = await upsertCanonical(client, tenant_id, rec, 'oem', req.user!.user_id, req.user!.role);
          if (res.created) created++;
          else updated++;
        }
      });
      return { processed: records.length, created, updated };
    },
  );
}
