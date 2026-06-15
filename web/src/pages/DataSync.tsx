import { useEffect, useState } from 'react';
import type { Tenant } from '@dealer/shared';
import { api, ApiError } from '../api/client';

const MAZDA_SAMPLE = {
  dealers: [
    {
      DealerCode: 'MAZDA-NEW-01',
      DealerName: 'Mazda Newcastle',
      StreetAddress: '1 Hunter St',
      Suburb: 'Newcastle',
      State: 'NSW',
      Postcode: '2300',
      Lat: -32.9283,
      Lng: 151.7817,
      Phone: '+61 2 4900 0000',
      Email: 'newcastle@mazda.example',
      Timezone: 'Australia/Sydney',
      EVCertified: 'Y',
      Capabilities: 'BEV;HEV;Metro',
      SalesOnly: 'N',
    },
  ],
};

export function DataSync() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [format, setFormat] = useState<'canonical' | 'mazda'>('mazda');
  const [payload, setPayload] = useState(JSON.stringify(MAZDA_SAMPLE, null, 2));
  const [stations, setStations] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const [t, s, r] = await Promise.all([api.tenants(), api.chargingStations(), api.changeRegisterRuns().catch(() => [])]);
    setTenants(t);
    if (!tenantId && t.length) setTenantId(t[0].tenant_id);
    setStations(s);
    setRuns(r);
  }
  useEffect(() => {
    load().catch((e) => setErr(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function note(text: string, isErr = false) {
    if (isErr) { setErr(text); setMsg(null); } else { setMsg(text); setErr(null); }
  }

  async function ingest() {
    try {
      const parsed = JSON.parse(payload);
      const res = await api.oemIngest({ tenant_id: tenantId, format, payload: parsed });
      note(`Ingested: ${res.processed} processed, ${res.created} created, ${res.updated} updated.`);
    } catch (e) {
      note(e instanceof ApiError ? e.message : e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : String(e), true);
    }
  }

  async function syncCharging() {
    try {
      const res = await api.syncCharging();
      note(`Charging sync complete: ${res.upserted} stations upserted.`);
      setStations(await api.chargingStations());
    } catch (e) {
      note(e instanceof ApiError ? e.message : String(e), true);
    }
  }

  return (
    <>
      <h2>Data sync console</h2>
      <p className="muted">Inbound OEM ingest, periodic charging-station sync, and Change Register history.</p>
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>OEM dealer ingest (FR-3)</h3>
        <div className="row">
          <div>
            <label>Tenant</label>
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              {tenants.map((t) => (
                <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Feed format</label>
            <select
              value={format}
              onChange={(e) => {
                const f = e.target.value as 'canonical' | 'mazda';
                setFormat(f);
                setPayload(JSON.stringify(f === 'mazda' ? MAZDA_SAMPLE : { records: [] }, null, 2));
              }}
            >
              <option value="mazda">Mazda-style (adapter normalises)</option>
              <option value="canonical">Canonical</option>
            </select>
          </div>
        </div>
        <label style={{ marginTop: 8 }}>Payload (JSON)</label>
        <textarea rows={12} value={payload} onChange={(e) => setPayload(e.target.value)} style={{ fontFamily: 'monospace' }} />
        <div style={{ marginTop: 8 }}>
          <button onClick={ingest} disabled={!tenantId}>Ingest</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Charging stations (FR-9) — {stations.length} synced</h3>
        <button onClick={syncCharging}>Run Chargefox / PlugShare sync</button>
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr><th>Name</th><th>Provider</th><th>Truck access</th><th>Last synced</th></tr>
          </thead>
          <tbody>
            {stations.map((s) => (
              <tr key={s.station_id}>
                <td>{s.name}</td>
                <td>{s.provider}</td>
                <td>{s.truck_accessible === null ? 'unknown' : s.truck_accessible ? 'yes' : 'no'}</td>
                <td className="muted">{new Date(s.last_synced_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Change Register runs (FR-6)</h3>
        {runs.length === 0 && <p className="muted">No runs yet — generate one from Import / Export.</p>}
        {runs.length > 0 && (
          <table>
            <thead>
              <tr><th>When</th><th>Club</th><th>Records</th><th>Delivery</th><th>Status</th><th>File</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.run_id}>
                  <td>{new Date(r.generated_at).toLocaleString()}</td>
                  <td>{r.tenant_or_club}</td>
                  <td>{r.record_count}</td>
                  <td>{r.delivery}</td>
                  <td>{r.status}</td>
                  <td className="muted" style={{ wordBreak: 'break-all' }}>{r.file_path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
