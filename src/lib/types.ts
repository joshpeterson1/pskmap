export interface SpotQuery {
  callsign: string;
  band: string | null;
  mode: string | null;
  timeRangeSeconds: number;
}

export interface Spot {
  senderCallsign: string;
  receiverCallsign: string;
  senderLocator: string | null;
  receiverLocator: string | null;
  frequency: number;
  mode: string;
  snr: number | null;
  timestamp: number;
  senderLat: number | null;
  senderLon: number | null;
  receiverLat: number | null;
  receiverLon: number | null;
  distanceKm: number | null;
}

export type ViewMode = "map" | "table" | "split";

export type SortField =
  | "timestamp"
  | "senderCallsign"
  | "receiverCallsign"
  | "frequency"
  | "mode"
  | "snr"
  | "distanceKm";

export type SortDir = "asc" | "desc";
