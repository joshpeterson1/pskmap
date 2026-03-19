export interface BandInfo {
  label: string;
  color: string;
  freqLow: number;
  freqHigh: number;
}

export const BANDS: Record<string, BandInfo> = {
  "160m": { label: "160m", color: "#ff6384", freqLow: 1_800_000, freqHigh: 2_000_000 },
  "80m":  { label: "80m",  color: "#ff9f40", freqLow: 3_500_000, freqHigh: 4_000_000 },
  "60m":  { label: "60m",  color: "#ffb347", freqLow: 5_250_000, freqHigh: 5_450_000 },
  "40m":  { label: "40m",  color: "#ffcd56", freqLow: 7_000_000, freqHigh: 7_300_000 },
  "30m":  { label: "30m",  color: "#c9cb3f", freqLow: 10_100_000, freqHigh: 10_150_000 },
  "20m":  { label: "20m",  color: "#4bc0c0", freqLow: 14_000_000, freqHigh: 14_350_000 },
  "17m":  { label: "17m",  color: "#36a2eb", freqLow: 18_068_000, freqHigh: 18_168_000 },
  "15m":  { label: "15m",  color: "#9966ff", freqLow: 21_000_000, freqHigh: 21_450_000 },
  "12m":  { label: "12m",  color: "#c45bff", freqLow: 24_890_000, freqHigh: 24_990_000 },
  "10m":  { label: "10m",  color: "#ff6bcd", freqLow: 28_000_000, freqHigh: 29_700_000 },
  "6m":   { label: "6m",   color: "#ff4444", freqLow: 50_000_000, freqHigh: 54_000_000 },
  "2m":   { label: "2m",   color: "#44ff88", freqLow: 144_000_000, freqHigh: 148_000_000 },
};

export const BAND_NAMES = ["All", ...Object.keys(BANDS)];

export function freqToBand(freq: number): string | null {
  for (const [name, info] of Object.entries(BANDS)) {
    if (freq >= info.freqLow && freq <= info.freqHigh) return name;
  }
  return null;
}

export function freqToBandColor(freq: number): string {
  const band = freqToBand(freq);
  if (band && BANDS[band]) return BANDS[band].color;
  return "#888888";
}

export function formatFreq(freq: number): string {
  if (freq >= 1_000_000) return (freq / 1_000_000).toFixed(3) + " MHz";
  if (freq >= 1_000) return (freq / 1_000).toFixed(1) + " kHz";
  return freq + " Hz";
}
