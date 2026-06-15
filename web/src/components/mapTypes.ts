import type { ChargingResult, SearchResultItem } from '@dealer/shared';

export interface MapProps {
  incident: { latitude: number; longitude: number };
  onIncidentChange: (lat: number, lng: number) => void;
  results: SearchResultItem[];
  charging: ChargingResult[];
}

export function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}
