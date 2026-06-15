import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import type { MapProps } from './mapTypes';
import { round5 } from './mapTypes';

// Fix Leaflet's default marker icon paths under a bundler.
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

/**
 * OpenStreetMap fallback map (no API key). Used when VITE_GOOGLE_MAPS_API_KEY is
 * not set. Drag the pin or click to set the incident location.
 */
export function LeafletMap({ incident, onIncidentChange, results, charging }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView([incident.latitude, incident.longitude], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([incident.latitude, incident.longitude], { draggable: true }).addTo(map);
    marker.bindTooltip('Incident — drag to move');
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng();
      onIncidentChange(round5(lat), round5(lng));
    });
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onIncidentChange(round5(e.latlng.lat), round5(e.latlng.lng));
    });

    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const marker = markerRef.current;
    const map = mapRef.current;
    if (!marker || !map) return;
    const cur = marker.getLatLng();
    if (round5(cur.lat) !== incident.latitude || round5(cur.lng) !== incident.longitude) {
      marker.setLatLng([incident.latitude, incident.longitude]);
      map.panTo([incident.latitude, incident.longitude]);
    }
  }, [incident.latitude, incident.longitude]);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;
    overlay.clearLayers();

    const points: L.LatLngExpression[] = [[incident.latitude, incident.longitude]];
    results.forEach((r, i) => {
      L.marker([r.latitude, r.longitude], { icon: numberIcon(i + 1, '#38bdf8') })
        .bindTooltip(`${i + 1}. ${r.name} — ${r.drive_time_minutes} min`)
        .addTo(overlay);
      points.push([r.latitude, r.longitude]);
    });
    charging.forEach((s) => {
      L.circleMarker([s.latitude, s.longitude], {
        radius: 7,
        color: '#22c55e',
        fillColor: '#22c55e',
        fillOpacity: 0.7,
      })
        .bindTooltip(`⚡ ${s.name}${s.drive_time_minutes ? ` — ${s.drive_time_minutes} min` : ''}`)
        .addTo(overlay);
      points.push([s.latitude, s.longitude]);
    });
    if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.2));
  }, [results, charging, incident.latitude, incident.longitude]);

  return <div ref={containerRef} style={{ height: 280, borderRadius: 8, overflow: 'hidden' }} />;
}

function numberIcon(n: number, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#06283d;font-weight:700;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:2px solid #06283d;box-shadow:0 1px 4px rgba(0,0,0,.4)">${n}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
