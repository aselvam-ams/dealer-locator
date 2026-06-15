import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';

type IntegrationMode = 'api' | 'sftp' | 'manual';

export function TenantManagement() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [country, setCountry] = useState<'AU' | 'NZ'>('AU');
  const [mode, setMode] = useState<IntegrationMode>('manual');
  const [active, setActive] = useState(true);

  async function load() {
    setTenants(await api.adminTenants());
  }
  useEffect(() => {
    load().catch((e) => setErr(String(e)));
  }, []);

  function note(text: string, isErr = false) {
    if (isErr) { setErr(text); setMsg(null); } else { setMsg(text); setErr(null); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createTenant({ name, country, integration_mode: mode, active });
      note(`Created tenant ${name}.`);
      setName('');
      await load();
    } catch (e2) {
      note(e2 instanceof ApiError ? e2.message : String(e2), true);
    }
  }

  async function patch(id: string, body: unknown) {
    try {
      await api.updateTenant(id, body);
      await load();
    } catch (e2) {
      note(e2 instanceof ApiError ? e2.message : String(e2), true);
    }
  }

  return (
    <>
      <h2>Tenant management</h2>
      <p className="muted">Create and configure OEM/Client tenants. NZ is modelled inactive for Phase 2.</p>
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Create tenant</h3>
        <form onSubmit={create}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div>
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label>Country</label>
              <select value={country} onChange={(e) => setCountry(e.target.value as 'AU' | 'NZ')}>
                <option value="AU">AU</option>
                <option value="NZ">NZ</option>
              </select>
            </div>
            <div>
              <label>Integration mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as IntegrationMode)}>
                <option value="manual">manual</option>
                <option value="api">api</option>
                <option value="sftp">sftp</option>
              </select>
            </div>
            <div style={{ flex: 'none' }}>
              <label>
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 'auto', marginRight: 6 }} />
                Active
              </label>
            </div>
            <div style={{ flex: 'none' }}>
              <button>Create</button>
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Name</th><th>Country</th><th>Mode</th><th>Locations</th><th>Active</th><th></th></tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.tenant_id}>
                <td>{t.name}</td>
                <td>{t.country}</td>
                <td>
                  <select value={t.integration_mode} onChange={(e) => patch(t.tenant_id, { integration_mode: e.target.value })}>
                    <option value="manual">manual</option>
                    <option value="api">api</option>
                    <option value="sftp">sftp</option>
                  </select>
                </td>
                <td>{t.location_count}</td>
                <td>{t.active ? <span className="ok">yes</span> : <span className="muted">no</span>}</td>
                <td>
                  <button className="secondary" onClick={() => patch(t.tenant_id, { active: !t.active })}>
                    {t.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
