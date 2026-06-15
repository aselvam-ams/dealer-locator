import type { SearchResultItem, ChargingStation } from '@dealer/shared';

interface Props {
  incident: { latitude: number; longitude: number };
  results: SearchResultItem[];
  charging: Array<ChargingStation & { distance_km: number }>;
}

/**
 * Renders the Google Maps JS view when a browser key is configured, otherwise
 * a static placeholder (spec 6.2 — map key is optional in the MVP).
 */
export function MapView({ incident, results, charging }: Props) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (key) {
    const markers = results
      .map((r, i) => `markers=label:${i + 1}|${r.latitude},${r.longitude}`)
      .join('&');
    const src = `https://maps.googleapis.com/maps/api/staticmap?center=${incident.latitude},${incident.longitude}&zoom=11&size=640x240&markers=color:red|${incident.latitude},${incident.longitude}&${markers}&key=${key}`;
    return <img src={src} alt="map" style={{ width: '100%', borderRadius: 8 }} />;
  }
  return (
    <div className="map-placeholder">
      <div style={{ textAlign: 'center' }}>
        <div>🗺 Map preview (set VITE_GOOGLE_MAPS_API_KEY to enable)</div>
        <div style={{ fontSize: '0.78rem', marginTop: 6 }}>
          Incident @ {incident.latitude.toFixed(3)}, {incident.longitude.toFixed(3)} ·{' '}
          {results.length} dealers · {charging.length} charging stations
        </div>
      </div>
    </div>
  );
}
