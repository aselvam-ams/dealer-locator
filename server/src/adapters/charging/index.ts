import type { ChargingProvider } from '@dealer/shared';

export interface ChargingStationRecord {
  provider: ChargingProvider;
  external_ref: string;
  name: string;
  latitude: number;
  longitude: number;
  truck_accessible: boolean | null;
}

/**
 * Periodic charging-station sync (spec FR-9 / 9.3). Not real-time availability
 * in Phase 1. The mock returns a fixed set of AU stations; a real Chargefox /
 * PlugShare client is a drop-in replacement.
 */
export interface ChargingStationSync {
  fetchStations(): Promise<ChargingStationRecord[]>;
}

export class MockChargingSync implements ChargingStationSync {
  async fetchStations(): Promise<ChargingStationRecord[]> {
    return [
      { provider: 'Chargefox', external_ref: 'cf-syd-01', name: 'Chargefox Sydney CBD', latitude: -33.8696, longitude: 151.2094, truck_accessible: false },
      { provider: 'Chargefox', external_ref: 'cf-syd-02', name: 'Chargefox Parramatta', latitude: -33.8150, longitude: 151.0011, truck_accessible: true },
      { provider: 'Chargefox', external_ref: 'cf-mel-01', name: 'Chargefox Melbourne Docklands', latitude: -37.8156, longitude: 144.9466, truck_accessible: true },
      { provider: 'PlugShare', external_ref: 'ps-mel-01', name: 'PlugShare Richmond', latitude: -37.8230, longitude: 144.9980, truck_accessible: null },
      { provider: 'Chargefox', external_ref: 'cf-bne-01', name: 'Chargefox Brisbane City', latitude: -27.4698, longitude: 153.0251, truck_accessible: false },
      { provider: 'PlugShare', external_ref: 'ps-per-01', name: 'PlugShare Perth CBD', latitude: -31.9523, longitude: 115.8613, truck_accessible: true },
      { provider: 'Chargefox', external_ref: 'cf-adl-01', name: 'Chargefox Adelaide', latitude: -34.9285, longitude: 138.6007, truck_accessible: null },
    ];
  }
}

export function makeChargingSync(): ChargingStationSync {
  return new MockChargingSync();
}
