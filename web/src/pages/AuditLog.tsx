import { useEffect, useState } from 'react';
import type { Tenant } from '@dealer/shared';
import { api, ApiError } from '../api/client';

const ENTITY_TYPES = ['', 'location', 'stop_tow', 'user', 'tenant', 'charging_station'];

export function AuditLog() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [tenantId, setTenantId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorRole, setActorRole] = useState('');

  useEffect(() => {
    api.tenants().then(setTenants).catch(() => setTenants([]));
    query();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function query() {
    setErr(null);
    const params: Record<string, string> = {};
    if (tenantId) params.tenant_id = tenantId;
    if (entityType) params.entity_type = entityType;
    if (actorRole) params.actor_role = actorRole;
    try {
      setRows(await api.journal(params));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <>
      <h2>Audit log</h2>
      <p className="muted">Append-only Journal of every dealer, Stop Tow, user and tenant change (spec §7.7 / §11).</p>
      {err && <p className="error">{err}</p>}

      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div>
            <label>Tenant</label>
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">All</option>
              {tenants.map((t) => (
                <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Entity type</label>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              {ENTITY_TYPES.map((x) => (
                <option key={x} value={x}>{x || 'All'}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Actor role</label>
            <input value={actorRole} onChange={(e) => setActorRole(e.target.value)} placeholder="e.g. dealer" />
          </div>
          <div style={{ flex: 'none' }}>
            <button onClick={query}>Apply filters</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{rows.length} entries</h3>
        <table>
          <thead>
            <tr>
              <th>When</th><th>Entity</th><th>Action</th><th>Field</th><th>Old → New</th><th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.journal_id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(h.occurred_at).toLocaleString()}</td>
                <td>{h.entity_type}</td>
                <td>{h.action}</td>
                <td>{h.field ?? ''}</td>
                <td className="muted">{fmt(h.old_value)} → {fmt(h.new_value)}</td>
                <td className="muted">{h.actor_role ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
