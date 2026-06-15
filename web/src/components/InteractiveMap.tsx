import type { MapProps } from './mapTypes';
import { LeafletMap } from './LeafletMap';
import { GoogleMap } from './GoogleMap';

/**
 * Incident map. Uses Google Maps JS when VITE_GOOGLE_MAPS_API_KEY is configured,
 * otherwise falls back to OpenStreetMap (Leaflet) so the app works with no key.
 */
export function InteractiveMap(props: MapProps) {
  const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  return googleKey ? <GoogleMap {...props} /> : <LeafletMap {...props} />;
}
