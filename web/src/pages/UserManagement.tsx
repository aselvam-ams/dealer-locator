import { useEffect, useState } from 'react';
import type { Role, Tenant } from '@dealer/shared';
import { ALL_ROLES } from '@dealer/shared';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth';

export function UserManagement() {
  const { user } = useAuth();
  const isOem = user!.role === 'oem_office';

  const [users, setUsers] = useState<any[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // create form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(isOem ? 'dealer' : 'consultant');
  const [tenantId, setTenantId] = useState(user!.tenant_id ?? '');
  const [locationId, setLocationId] = useState('');
  const [entitlements, setEntitlements] = useState<string[]>([]);

  const roleOptions: Role[] = isOem ? ['dealer'] : ALL_ROLES;
  const needsTenant = role === 'oem_office' || role === 'dealer';
  const needsLocation = role === 'dealer';
  const needsEntitlements = role === 'consultant' || role === 'service_provider';

  async function load() {
    const [u, t] = await Promise.all([api.users(), api.tenants()]);
    setUsers(u);
    setTenants(t);
  }

  useEffect(() => {
    load().catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (needsLocation && tenantId) {
      api.tenantLocations(tenantId).then(setLocations).catch(() => setLocations([]));
    }
  }, [needsLocation, tenantId]);

  function note(text: string, isErr = false) {
    if (isErr) { setErr(text); setMsg(null); } else { setMsg(text); setErr(null); }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createUser({
        email,
        password,
        role,
        tenant_id: needsTenant ? tenantId : null,
        location_id: needsLocation ? locationId : null,
        entitlements: needsEntitlements ? entitlements : [],
      });
      note(`Created ${email}.`);
      setEmail(''); setPassword(''); setEntitlements([]); setLocationId('');
      await load();
    } catch (e2) {
      note(e2 instanceof ApiError ? e2.message : String(e2), true);
    }
  }

  async function toggleActive(u: any) {
    try {
      await api.updateUser(u.user_id, { active: !u.active });
      await load();
    } catch (e2) {
      note(e2 instanceof ApiError ? e2.message : String(e2), true);
    }
  }

  async function resetPassword(u: any) {
    const pw = prompt(`New password for ${u.email} (min 8 chars):`);
    if (!pw) return;
    try {
      await api.updateUser(u.user_id, { password: pw });
      note(`Password reset for ${u.email}.`);
    } catch (e2) {
      note(e2 instanceof ApiError ? e2.message : String(e2), true);
    }
  }

  const tenantName = (id: string | null) => tenants.find((t) => t.tenant_id === id)?.name ?? '—';

  return (
    <>
      <h2>User management</h2>
      <p className="muted">
        {isOem
          ? 'Create and manage Dealer accounts within your tenant (spec §5.1).'
          : 'Create and manage accounts across all tenants (spec §5.1).'}
      </p>
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Create user</h3>
        <form onSubmit={createUser}>
          <div className="row">
            <div>
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label>Temp password (min 8)</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <div>
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isOem}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            {needsTenant && (
              <div>
                <label>Tenant</label>
                <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} disabled={isOem} required>
                  <option value="">Select…</option>
                  {tenants.map((t) => (
                    <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            {needsLocation && (
              <div>
                <label>Bound location</label>
                <select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
                  <option value="">Select…</option>
                  {locations.map((l) => (
                    <option key={l.location_id} value={l.location_id}>
                      {l.name.value} ({l.suburb})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {needsEntitlements && (
              <div>
                <label>Entitled tenants</label>
                <div>
                  {tenants.map((t) => (
                    <label key={t.tenant_id} style={{ display: 'inline-block', marginRight: 10 }}>
                      <input
                        type="checkbox"
                        checked={entitlements.includes(t.tenant_id)}
                        onChange={(e) =>
                          setEntitlements((prev) =>
                            e.target.checked ? [...prev, t.tenant_id] : prev.filter((x) => x !== t.tenant_id),
                          )
                        }
                        style={{ width: 'auto', marginRight: 4 }}
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button style={{ marginTop: 12 }}>Create user</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Users ({users.length})</h3>
        <table>
          <thead>
            <tr>
              <th>Email</th><th>Role</th><th>Tenant</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{tenantName(u.tenant_id)}</td>
                <td>{u.active ? <span className="ok">active</span> : <span className="muted">disabled</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="secondary" onClick={() => toggleActive(u)}>
                    {u.active ? 'Disable' : 'Enable'}
                  </button>{' '}
                  <button className="secondary" onClick={() => resetPassword(u)}>Reset password</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
