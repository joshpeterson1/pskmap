export interface ExternalSpot {
  source: SpotSource;
  callsign: string;
  frequency: number | null;
  mode: string | null;
  reference: string | null;
  referenceName: string | null;
  lat: number | null;
  lon: number | null;
  grid: string | null;
  timestamp: number | null;
  spotter: string | null;
  comments: string | null;
}

export type SpotSource = "pota" | "sota" | "rbn" | "dxcluster";

export const SOURCE_COLORS: Record<SpotSource, string> = {
  pota: "#3fb950",
  sota: "#d29922",
  rbn: "#bc8cff",
  dxcluster: "#f85149",
};

export const SOURCE_LABELS: Record<SpotSource, string> = {
  pota: "POTA",
  sota: "SOTA",
  rbn: "RBN",
  dxcluster: "DXCluster",
};
