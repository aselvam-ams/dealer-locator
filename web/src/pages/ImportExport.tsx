import { useEffect, useState } from 'react';
import type { Tenant } from '@dealer/shared';
import { api, ApiError } from '../api/client';
import { useAuth, can } from '../auth';

export function ImportExport() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(user!.tenant_id ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [club, setClub] = useState('RACV');
  const [crResult, setCrResult] = useState<any | null>(null);

  useEffect(() => {
    api.tenants().then((t) => {
      setTenants(t);
      if (!tenantId && t.length) setTenantId(t[0].tenant_id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doExport() {
    setErr(null);
    try {
      const blob = await api.exportExcel(tenantId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dealers-${tenantId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('Export downloaded.');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  }

  async function doImport(file: File) {
    setErr(null);
    setMsg(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await api.importExcel(tenantId, base64);
      setMsg(`Imported ${res.processed} rows (${res.created} created, ${res.updated} updated).`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  }

  async function doChangeRegister() {
    setErr(null);
    setCrResult(null);
    try {
      const res = await api.runChangeRegister(tenantId, club);
      setCrResult(res);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <>
      <h2>Import / Export</h2>
      <p className="muted">Excel bulk upload / export and Change Register generation (power users / OEM Office).</p>
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}

      <div className="card">
        <label>Tenant</label>
        <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} disabled={!!user!.tenant_id}>
          {tenants.map((t) => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.name}
            </option>
          ))}
        </select>

        <div className="row" style={{ marginTop: 12 }}>
          <div style={{ flex: 'none' }}>
            <label>Export</label>
            <button onClick={doExport} disabled={!tenantId}>Download Excel template</button>
          </div>
          <div>
            <label>Import (Excel)</label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
            />
          </div>
        </div>
      </div>

      {can(user!.role, 'change_register') && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Change Register (outbound to Clubs)</h3>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div>
              <label>Club</label>
              <select value={club} onChange={(e) => setClub(e.target.value)}>
                <option>RACV</option>
                <option>NRMA</option>
                <option>Other</option>
              </select>
            </div>
            <div style={{ flex: 'none' }}>
              <button onClick={doChangeRegister} disabled={!tenantId}>Generate &amp; deliver delta</button>
            </div>
          </div>
          {crResult && (
            <div style={{ marginTop: 12 }}>
              <p className="ok">
                Delivered {crResult.record_count} change(s) to <code>{crResult.file_path}</code>
              </p>
              <pre style={{ maxHeight: 240, overflow: 'auto', background: 'var(--panel-2)', padding: 12, borderRadius: 6 }}>
                {JSON.stringify(crResult.delta, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data: prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
