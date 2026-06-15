import { useEffect, useState } from 'react';
import type { Location, OpeningHours, ServiceCapability, StopTowState, Weekday } from '@dealer/shared';
import { ALL_CAPABILITIES } from '@dealer/shared';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth';

const DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

interface LocFull extends Location {
  stop_tow: StopTowState | null;
}

export function LocationEditor({ locationId, onChanged }: { locationId: string; onChanged?: () => void }) {
  const { user } = useAuth();
  const role = user!.role;
  const isDealer = role === 'dealer';
  const canManage = ['admin', 'ams_power_user', 'oem_office'].includes(role);
  const canLock = canManage;

  const [loc, setLoc] = useState<LocFull | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<any[] | null>(null);

  // editable field state
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [evCertified, setEvCertified] = useState(false);
  const [caps, setCaps] = useState<ServiceCapability[]>([]);
  const [hours, setHours] = useState<OpeningHours | null>(null);

  // stop tow
  const [reason, setReason] = useState('');

  async function load() {
    const l = (await api.location(locationId)) as LocFull;
    setLoc(l);
    setPhone(l.phone.value);
    setEmail(l.email.value);
    setName(l.name.value);
    setAddress(l.address.value);
    setEvCertified(l.ev_certified.value);
    setCaps(l.service_capabilities.value);
    setHours(l.opening_hours.value);
    setHistory(null);
  }

  useEffect(() => {
    load().catch((e) => setErr(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  if (!loc || !hours) return <p className="muted">Loading location…</p>;

  function note(text: string, isErr = false) {
    if (isErr) {
      setErr(text);
      setMsg(null);
    } else {
      setMsg(text);
      setErr(null);
    }
  }

  async function saveFields() {
    try {
      const provenance: Record<string, unknown> = { phone, email, opening_hours: hours };
      if (canManage) {
        provenance.name = name;
        provenance.address = address;
        provenance.ev_certified = evCertified;
        provenance.service_capabilities = caps;
      }
      await api.updateLocation(locationId, { provenance });
      note('Saved.');
      await load();
      onChanged?.();
    } catch (e) {
      note(e instanceof ApiError ? e.message : String(e), true);
    }
  }

  async function toggleStopTow(enabled: boolean) {
    try {
      await api.setStopTow(locationId, { enabled, reason: reason || null });
      note(`Stop Tow ${enabled ? 'enabled' : 'disabled'}.`);
      await load();
      onChanged?.();
    } catch (e) {
      note(e instanceof ApiError ? e.message : String(e), true);
    }
  }

  async function toggleLock(locked: boolean) {
    try {
      await api.setLock(locationId, locked);
      note(`Stop Tow lock ${locked ? 'set' : 'cleared'}.`);
      await load();
    } catch (e) {
      note(e instanceof ApiError ? e.message : String(e), true);
    }
  }

  const st = loc.stop_tow;
  const lockBlocksDealer = isDealer && st?.locked_by_oem;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>
        {loc.name.value} <span className="muted">({loc.external_ref})</span>
      </h3>
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}

      {/* Stop Tow controls */}
      <div className="card" style={{ background: 'var(--panel-2)' }}>
        <strong>Stop Tow</strong>{' '}
        {st?.enabled ? <span className="badge stop">ENABLED</span> : <span className="badge">off</span>}
        {st?.locked_by_oem && <span className="badge restrict">🔒 OEM-locked</span>}
        <div className="row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
          <div>
            <label>Reason (optional)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div style={{ flex: 'none' }}>
            <button
              className="danger"
              disabled={!!lockBlocksDealer || st?.enabled}
              onClick={() => toggleStopTow(true)}
            >
              Enable Stop Tow
            </button>{' '}
            <button
              className="secondary"
              disabled={!!lockBlocksDealer || !st?.enabled}
              onClick={() => toggleStopTow(false)}
            >
              Disable
            </button>
          </div>
          {canLock && (
            <div style={{ flex: 'none' }}>
              <label>
                <input
                  type="checkbox"
                  checked={!!st?.locked_by_oem}
                  onChange={(e) => toggleLock(e.target.checked)}
                  style={{ width: 'auto', marginRight: 6 }}
                />
                OEM lock (dealer cannot toggle)
              </label>
            </div>
          )}
        </div>
        {lockBlocksDealer && (
          <p className="muted" style={{ marginBottom: 0 }}>
            This location is OEM-locked. Contact your OEM Office to change Stop Tow.
          </p>
        )}
        {st?.set_at && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Last set {new Date(st.set_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* Editable fields */}
      <div className="row">
        <div>
          <label>Phone {fieldSource(loc.phone)}</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label>Email {fieldSource(loc.email)}</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>

      {canManage && (
        <>
          <div className="row" style={{ marginTop: 8 }}>
            <div>
              <label>Name {fieldSource(loc.name)}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label>Address {fieldSource(loc.address)}</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <div style={{ flex: 'none' }}>
              <label>EV-Certified {fieldSource(loc.ev_certified)}</label>
              <label>
                <input
                  type="checkbox"
                  checked={evCertified}
                  onChange={(e) => setEvCertified(e.target.checked)}
                  style={{ width: 'auto', marginRight: 6 }}
                />
                EV-certified (high-voltage capable)
              </label>
            </div>
            <div>
              <label>Service capabilities {fieldSource(loc.service_capabilities)}</label>
              <div>
                {ALL_CAPABILITIES.map((c) => (
                  <label key={c} style={{ display: 'inline-block', marginRight: 10 }}>
                    <input
                      type="checkbox"
                      checked={caps.includes(c)}
                      onChange={(e) =>
                        setCaps((prev) => (e.target.checked ? [...prev, c] : prev.filter((x) => x !== c)))
                      }
                      style={{ width: 'auto', marginRight: 4 }}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Opening hours */}
      <label style={{ marginTop: 12 }}>Opening hours ({hours.timezone})</label>
      <table>
        <tbody>
          {DAYS.map((d) => (
            <tr key={d}>
              <td style={{ textTransform: 'capitalize', width: 60 }}>{d}</td>
              <td>
                <input
                  style={{ width: 110 }}
                  placeholder="closed"
                  value={hours.days[d].open ?? ''}
                  onChange={(e) => setDay(d, 'open', e.target.value)}
                />
              </td>
              <td>
                <input
                  style={{ width: 110 }}
                  placeholder="closed"
                  value={hours.days[d].close ?? ''}
                  onChange={(e) => setDay(d, 'close', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 12 }}>
        <button onClick={saveFields}>Save changes</button>{' '}
        <button
          className="secondary"
          onClick={() => api.locationHistory(locationId).then(setHistory)}
        >
          View change history
        </button>
      </div>

      {history && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Field</th>
              <th>Old → New</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.journal_id}>
                <td>{new Date(h.occurred_at).toLocaleString()}</td>
                <td>{h.action}</td>
                <td>{h.field ?? ''}</td>
                <td className="muted">
                  {fmt(h.old_value)} → {fmt(h.new_value)}
                </td>
                <td className="muted">{h.actor_role ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  function setDay(d: Weekday, key: 'open' | 'close', value: string) {
    setHours((prev) =>
      prev
        ? { ...prev, days: { ...prev.days, [d]: { ...prev.days[d], [key]: value || null } } }
        : prev,
    );
  }
}

function fieldSource(f: { source: string; locked: boolean }) {
  return (
    <span className="muted" style={{ fontSize: '0.7rem' }}>
      [{f.source}
      {f.locked ? ' 🔒' : ''}]
    </span>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
