/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react';
import type { MapProps } from './mapTypes';
import { round5 } from './mapTypes';

let loader: Promise<typeof google> | null = null;

function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (typeof google !== 'undefined' && google.maps) return Promise.resolve(google);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly`;
    script.async = true;
    script.onload = () => resolve(google);
    script.onerror = () => reject(new Error('Failed to load Google Maps JS'));
    document.head.appendChild(script);
  });
  return loader;
}

/**
 * Google Maps JS view (spec §6.2 / §9.1). Used when VITE_GOOGLE_MAPS_API_KEY is
 * set. Draggable incident pin + click-to-place, with result/charging markers.
 */
export function GoogleMap({ incident, onIncidentChange, results, charging }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const overlaysRef = useRef<google.maps.Marker[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then((g) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = new g.maps.Map(containerRef.current, {
          center: { lat: incident.latitude, lng: incident.longitude },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
        });
        const marker = new g.maps.Marker({
          position: { lat: incident.latitude, lng: incident.longitude },
          map,
          draggable: true,
          title: 'Incident — drag to move',
        });
        marker.addListener('dragend', () => {
          const p = marker.getPosition();
          if (p) onIncidentChange(round5(p.lat()), round5(p.lng()));
        });
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          marker.setPosition(e.latLng);
          onIncidentChange(round5(e.latLng.lat()), round5(e.latLng.lng()));
        });
        mapRef.current = map;
        markerRef.current = marker;
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = markerRef.current;
    const map = mapRef.current;
    if (!m || !map) return;
    const p = m.getPosition();
    if (!p || round5(p.lat()) !== incident.latitude || round5(p.lng()) !== incident.longitude) {
      const pos = { lat: incident.latitude, lng: incident.longitude };
      m.setPosition(pos);
      map.panTo(pos);
    }
  }, [incident.latitude, incident.longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof google === 'undefined') return;
    overlaysRef.current.forEach((m) => m.setMap(null));
    overlaysRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: incident.latitude, lng: incident.longitude });

    results.forEach((r, i) => {
      const m = new google.maps.Marker({
        position: { lat: r.latitude, lng: r.longitude },
        map,
        label: String(i + 1),
        title: `${i + 1}. ${r.name} — ${r.drive_time_minutes} min`,
      });
      overlaysRef.current.push(m);
      bounds.extend({ lat: r.latitude, lng: r.longitude });
    });
    charging.forEach((s) => {
      const m = new google.maps.Marker({
        position: { lat: s.latitude, lng: s.longitude },
        map,
        title: `⚡ ${s.name}${s.drive_time_minutes ? ` — ${s.drive_time_minutes} min` : ''}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: '#22c55e',
          fillOpacity: 0.85,
          strokeColor: '#06283d',
          strokeWeight: 1,
        },
      });
      overlaysRef.current.push(m);
      bounds.extend({ lat: s.latitude, lng: s.longitude });
    });
    if (results.length || charging.length) map.fitBounds(bounds);
  }, [results, charging, incident.latitude, incident.longitude]);

  if (error) {
    return <div className="map-placeholder">Google Maps failed to load — {error}</div>;
  }
  return <div ref={containerRef} style={{ height: 280, borderRadius: 8, overflow: 'hidden' }} />;
}
