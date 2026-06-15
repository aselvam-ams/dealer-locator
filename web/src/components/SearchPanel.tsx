import { useEffect, useState } from 'react';
import type {
  HighVoltageFault,
  LocationType,
  SearchResponse,
  Tenant,
} from '@dealer/shared';
import { api, ApiError } from '../api/client';
import { CapabilityChips, EvBadge, RestrictionBadges, StopTowBadge } from './Badges';
import { MapView } from './MapView';

export function SearchPanel({ compact = false }: { compact?: boolean }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [types, setTypes] = useState<LocationType[]>([]);
  const [typeId, setTypeId] = useState('');
  const [postcode, setPostcode] = useState('2000');
  const [hvFault, setHvFault] = useState<HighVoltageFault>('unknown');
  const [excludeSalesOnly, setExcludeSalesOnly] = useState(true);
  const [towContext, setTowContext] = useState(true);
  const [resp, setResp] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.tenants().then((t) => {
      setTenants(t);
      if (t.length) setTenantId(t[0].tenant_id);
    });
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    setTypeId('');
    api.locationTypes(tenantId).then(setTypes).catch(() => setTypes([]));
  }, [tenantId]);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.search({
        tenant_id: tenantId,
        postcode,
        high_voltage_fault: hvFault,
        location_type_id: typeId || undefined,
        exclude_sales_only: excludeSalesOnly,
        tow_context: towContext,
      });
      setResp(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setResp(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className="card" onSubmit={runSearch}>
        <div className="row">
          <div>
            <label>Client / Tenant</label>
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              {tenants.map((t) => (
                <option key={t.tenant_id} value={t.tenant_id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Incident postcode</label>
            <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. 2000" />
          </div>
          {!compact && (
            <div>
              <label>Location type</label>
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                <option value="">Any</option>
                {types.map((t) => (
                  <option key={t.location_type_id} value={t.location_type_id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: '0.8rem', alignItems: 'flex-end' }}>
          <div>
            <label>High-voltage fault? (EV routing)</label>
            <div className="toggle-pill">
              {(['yes', 'no', 'unknown'] as HighVoltageFault[]).map((v) => (
                <button
                  type="button"
                  key={v}
                  className={hvFault === v ? 'on' : ''}
                  onClick={() => setHvFault(v)}
                >
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 'none' }}>
            <label>
              <input
                type="checkbox"
                checked={excludeSalesOnly}
                onChange={(e) => setExcludeSalesOnly(e.target.checked)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              Exclude sales-only
            </label>
            <label>
              <input
                type="checkbox"
                checked={towContext}
                onChange={(e) => setTowContext(e.target.checked)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              Tow context (open now + not Stop-Towed)
            </label>
          </div>
          <div style={{ flex: 'none' }}>
            <button disabled={busy || !tenantId}>{busy ? 'Searching…' : 'Find nearest dealers'}</button>
          </div>
        </div>
        {hvFault === 'unknown' && (
          <p className="muted" style={{ margin: '0.6rem 0 0' }}>
            “Unknown” applies the safe path: EV-certified dealers only.
          </p>
        )}
      </form>

      {error && <p className="error">{error}</p>}

      {resp && (
        <>
          <div className="card">
            <MapView incident={resp.incident} results={resp.results} charging={resp.charging_stations} />
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Nearest eligible dealers ({resp.results.length})</h3>
            {resp.results.length === 0 && <p className="muted">No eligible dealers for these filters.</p>}
            {resp.results.map((r, i) => (
              <div className="result" key={r.location_id}>
                <div className="rank">{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <strong>{r.name}</strong>
                  <div className="meta">
                    {r.address}, {r.suburb} {r.state} {r.postcode} · {r.phone}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <StopTowBadge on={r.stop_tow} />
                    <EvBadge certified={r.ev_certified} />
                    <CapabilityChips caps={r.service_capabilities} />
                    <RestrictionBadges restrictions={r.restrictions} />
                    {r.is_sales_only && <span className="badge">Sales only</span>}
                  </div>
                </div>
                <div className="drive">
                  <div className="big">{r.drive_time_minutes} min</div>
                  <div className="meta">{r.distance_km} km</div>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Nearby EV charging</h3>
            {resp.charging_stations.map((s) => (
              <div key={s.station_id} style={{ marginBottom: 6 }}>
                ⚡ <strong>{s.name}</strong>{' '}
                <span className="muted">
                  ({s.provider}, {s.distance_km} km)
                </span>{' '}
                {s.truck_accessible === true && <span className="badge cap">truck-accessible</span>}
                {s.truck_accessible === false && <span className="badge restrict">not truck-accessible</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
