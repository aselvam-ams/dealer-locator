import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import type { OpeningHours, ProvenanceSource, ServiceCapability } from '@dealer/shared';
import { withTransaction } from '../db/pool.js';
import { listByTenant } from '../domain/locationRepo.js';
import { upsertCanonical } from '../domain/locationIngest.js';
import type { CanonicalLocationInput } from '../adapters/oemIngest/index.js';
import { authenticate, assertTenant, requireCapability } from '../auth/guards.js';

const COLUMNS = [
  'external_ref', 'name', 'address', 'suburb', 'state', 'postcode',
  'latitude', 'longitude', 'phone', 'email', 'timezone', 'ev_certified',
  'service_capabilities', 'is_sales_only',
];

function defaultHours(tz: string): OpeningHours {
  const wd = { open: '08:00', close: '17:30' };
  const sat = { open: '09:00', close: '13:00' };
  const closed = { open: null, close: null };
  return { timezone: tz, days: { mon: wd, tue: wd, wed: wd, thu: wd, fri: wd, sat, sun: closed } };
}

const importSchema = z.object({
  tenant_id: z.string().uuid(),
  file_base64: z.string().min(1),
});

export async function importExportRoutes(app: FastifyInstance) {
  // Export a tenant's locations as an Excel workbook (spec FR-13).
  app.get(
    '/api/tenants/:id/export',
    { preHandler: [authenticate, requireCapability('import_export')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!assertTenant(req.user!, id, reply)) return;
      const locations = await listByTenant(id);

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Dealers');
      ws.addRow(COLUMNS);
      for (const l of locations) {
        ws.addRow([
          l.external_ref,
          l.name.value,
          l.address.value,
          l.suburb,
          l.state,
          l.postcode,
          l.latitude,
          l.longitude,
          l.phone.value,
          l.email.value,
          l.opening_hours.value.timezone,
          l.ev_certified.value ? 'Y' : 'N',
          l.service_capabilities.value.join(';'),
          l.is_sales_only ? 'Y' : 'N',
        ]);
      }
      const buffer = await wb.xlsx.writeBuffer();
      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="dealers-${id}.xlsx"`);
      return reply.send(Buffer.from(buffer));
    },
  );

  // Import / bulk-upsert from an Excel workbook (spec FR-13).
  app.post(
    '/api/import',
    { preHandler: [authenticate, requireCapability('import_export')] },
    async (req, reply) => {
      const parsed = importSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const { tenant_id, file_base64 } = parsed.data;
      if (!assertTenant(req.user!, tenant_id, reply)) return;

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(file_base64, 'base64') as any);
      const ws = wb.worksheets[0];
      if (!ws) return reply.code(400).send({ error: 'No worksheet found' });

      const header = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? '').trim());
      const idx = (name: string) => header.indexOf(name);

      const source: ProvenanceSource = req.user!.role === 'oem_office' ? 'oem' : 'ams';
      const inputs: CanonicalLocationInput[] = [];
      ws.eachRow((row, n) => {
        if (n === 1) return;
        const get = (col: string) => {
          const i = idx(col);
          return i >= 0 ? row.getCell(i + 1).value : null;
        };
        const ref = get('external_ref');
        if (!ref) return;
        const tz = String(get('timezone') ?? 'Australia/Sydney');
        const caps = String(get('service_capabilities') ?? '')
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean) as ServiceCapability[];
        inputs.push({
          external_ref: String(ref),
          name: String(get('name') ?? ''),
          address: String(get('address') ?? ''),
          suburb: String(get('suburb') ?? ''),
          state: String(get('state') ?? ''),
          postcode: String(get('postcode') ?? ''),
          latitude: Number(get('latitude')),
          longitude: Number(get('longitude')),
          phone: String(get('phone') ?? ''),
          email: String(get('email') ?? ''),
          opening_hours: defaultHours(tz),
          ev_certified: String(get('ev_certified') ?? 'N').toUpperCase() === 'Y',
          service_capabilities: caps,
          is_sales_only: String(get('is_sales_only') ?? 'N').toUpperCase() === 'Y',
        });
      });

      let created = 0;
      let updated = 0;
      await withTransaction(async (client) => {
        for (const input of inputs) {
          const res = await upsertCanonical(client, tenant_id, input, source, req.user!.user_id, req.user!.role);
          if (res.created) created++;
          else updated++;
        }
      });
      return { processed: inputs.length, created, updated };
    },
  );
}
