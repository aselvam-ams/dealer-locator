import { useEffect, useState } from 'react';
import type { Tenant } from '@dealer/shared';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth';
import { LocationEditor } from '../components/LocationEditor';

export function DealerManagement() {
  const { user } = useAuth();
  const isDealer = user!.role === 'dealer';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(user!.tenant_id ?? '');
  const [locations, setLocations] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(isDealer ? user!.location_id : null);
  const [bulkPostcode, setBulkPostcode] = useState('');
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isDealer) return;
    api.tenants().then((t) => {
      setTenants(t);
      if (!tenantId && t.length) setTenantId(t[0].tenant_id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadList() {
    if (isDealer || !tenantId) return;
    const list = await api.tenantLocations(tenantId);
    setLocations(list);
  }

  useEffect(() => {
    loadList().catch(() => setLocations([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  if (isDealer) {
    return (
      <>
        <h2>My location</h2>
        {user!.location_id ? (
          <LocationEditor locationId={user!.location_id} />
        ) : (
          <p className="error">No location is bound to this dealer account.</p>
        )}
      </>
    );
  }

  async function runBulk(enabled: boolean) {
    setBulkMsg(null);
    try {
      const res = await api.bulkStopTow({ tenant_id: tenantId, postcode: bulkPostcode, enabled });
      setBulkMsg(`${enabled ? 'Enabled' : 'Disabled'} Stop Tow on ${res.updated} location(s) in ${bulkPostcode}.`);
      await loadList();
    } catch (e) {
      setBulkMsg(e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <>
      <h2>Dealer management</h2>
      <div className="card">
        <div className="row">
          <div>
            <label>Tenant</label>
            <select value={tenantId} onChange={(e) => { setTenantId(e.target.value); setSelected(null); }}>
              {tenants.map((t) => (
                <option key={t.tenant_id} value={t.tenant_id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Bulk Stop Tow by postcode</label>
            <div className="row">
              <input value={bulkPostcode} onChange={(e) => setBulkPostcode(e.target.value)} placeholder="e.g. 2000" />
              <button className="danger" style={{ flex: 'none' }} disabled={!bulkPostcode} onClick={() => runBulk(true)}>
                Enable
              </button>
              <button className="secondary" style={{ flex: 'none' }} disabled={!bulkPostcode} onClick={() => runBulk(false)}>
                Disable
              </button>
            </div>
          </div>
        </div>
        {bulkMsg && <p className="ok">{bulkMsg}</p>}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Suburb</th>
              <th>Postcode</th>
              <th>Stop Tow</th>
              <th>EV</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.location_id}>
                <td>{l.name.value}</td>
                <td>{l.suburb}</td>
                <td>{l.postcode}</td>
                <td>
                  {l.stop_tow?.enabled ? <span className="badge stop">on</span> : <span className="muted">off</span>}
                  {l.stop_tow?.locked_by_oem && <span className="badge restrict">🔒</span>}
                </td>
                <td>{l.ev_certified.value ? '⚡' : ''}</td>
                <td>
                  <button className="secondary" onClick={() => setSelected(l.location_id)}>
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <LocationEditor locationId={selected} onChanged={loadList} />}
    </>
  );
}
