import { useEffect, useState } from 'react';
import type {
  HighVoltageFault,
  LocationType,
  SearchDestination,
  SearchRequest,
  SearchResponse,
  Tenant,
} from '@dealer/shared';
import { api, ApiError } from '../api/client';
import { CapabilityChips, EvBadge, RestrictionBadges, StopTowBadge } from './Badges';
import { InteractiveMap } from './InteractiveMap';

// Default incident: Sydney CBD. The consultant drags the pin or edits lat/long.
const DEFAULT_INCIDENT = { lat: -33.8688, lng: 151.2093 };

type IncidentMode = 'pin' | 'postcode';

export function SearchPanel({ compact = false }: { compact?: boolean }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [types, setTypes] = useState<LocationType[]>([]);
  const [typeId, setTypeId] = useState('');
  const [destination, setDestination] = useState<SearchDestination>('dealer');

  const [incidentMode, setIncidentMode] = useState<IncidentMode>('pin');
  const [lat, setLat] = useState(DEFAULT_INCIDENT.lat);
  const [lng, setLng] = useState(DEFAULT_INCIDENT.lng);
  const [postcode, setPostcode] = useState('2000');

  const [hvFault, setHvFault] = useState<HighVoltageFault>('unknown');
  const [excludeSalesOnly, setExcludeSalesOnly] = useState(true);
  const [towContext, setTowContext] = useState(true);

  const [resp, setResp] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isCharging = destination === 'charging';

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

  function onMapPick(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
    setIncidentMode('pin'); // dragging/clicking defines the incident by coordinates
  }

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const req: SearchRequest = {
        tenant_id: tenantId,
        high_voltage_fault: hvFault,
        destination,
        ...(incidentMode === 'pin' ? { latitude: lat, longitude: lng } : { postcode }),
      };
      if (!isCharging) {
        req.location_type_id = typeId || undefined;
        req.exclude_sales_only = excludeSalesOnly;
        req.tow_context = towContext;
      }
      const r = await api.search(req);
      setResp(r);
      // Sync the pin to where we actually searched (esp. for postcode lookups).
      setLat(r.incident.latitude);
      setLng(r.incident.longitude);
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
            <label>Tow destination</label>
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value as SearchDestination)}
            >
              <option value="dealer">Nearest dealer</option>
              <option value="charging">⚡ EV charging only (charge-only tow)</option>
            </select>
          </div>
          {!isCharging && !compact && (
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

        {/* Incident location: drag-and-drop pin / lat-long, or postcode */}
        <div style={{ marginTop: '0.8rem' }}>
          <label>Incident location</label>
          <div className="toggle-pill" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className={incidentMode === 'pin' ? 'on' : ''}
              onClick={() => setIncidentMode('pin')}
            >
              Map pin / lat-long
            </button>
            <button
              type="button"
              className={incidentMode === 'postcode' ? 'on' : ''}
              onClick={() => setIncidentMode('postcode')}
            >
              Postcode
            </button>
          </div>

          {incidentMode === 'pin' ? (
            <div className="row">
              <div>
                <label>Latitude</label>
                <input
                  type="number"
                  step="0.00001"
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value))}
                />
              </div>
              <div>
                <label>Longitude</label>
                <input
                  type="number"
                  step="0.00001"
                  value={lng}
                  onChange={(e) => setLng(parseFloat(e.target.value))}
                />
              </div>
            </div>
          ) : (
            <div className="row">
              <div>
                <label>Postcode</label>
                <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. 2000" />
              </div>
            </div>
          )}

          <p className="muted" style={{ margin: '6px 0' }}>
            Drag the pin or click the map to set the incident point.
          </p>
          <InteractiveMap
            incident={{ latitude: lat, longitude: lng }}
            onIncidentChange={onMapPick}
            results={resp?.results ?? []}
            charging={resp?.charging_stations ?? []}
          />
        </div>

        {!isCharging && (
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
          </div>
        )}

        <div style={{ marginTop: '0.9rem' }}>
          <button disabled={busy || !tenantId}>
            {busy ? 'Searching…' : isCharging ? 'Find nearest charging' : 'Find nearest dealers'}
          </button>
        </div>
        {!isCharging && hvFault === 'unknown' && (
          <p className="muted" style={{ margin: '0.6rem 0 0' }}>
            “Unknown” applies the safe path: EV-certified dealers only.
          </p>
        )}
      </form>

      {error && <p className="error">{error}</p>}

      {resp && isCharging && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Nearest EV charging — charge-only tow ({resp.charging_stations.length})</h3>
          {resp.charging_stations.length === 0 && <p className="muted">No charging stations found.</p>}
          {resp.charging_stations.map((s, i) => (
            <div className="result" key={s.station_id}>
              <div className="rank">{i + 1}</div>
              <div style={{ flex: 1 }}>
                <strong>⚡ {s.name}</strong>
                <div className="meta">{s.provider}</div>
                <div style={{ marginTop: 4 }}>
                  {s.truck_accessible === true && <span className="badge cap">truck-accessible</span>}
                  {s.truck_accessible === false && <span className="badge restrict">not truck-accessible</span>}
                  {s.truck_accessible === null && <span className="badge">truck access unknown</span>}
                </div>
              </div>
              <div className="drive">
                {s.drive_time_minutes != null && <div className="big">{s.drive_time_minutes} min</div>}
                <div className="meta">{s.distance_km} km</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {resp && !isCharging && (
        <>
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
