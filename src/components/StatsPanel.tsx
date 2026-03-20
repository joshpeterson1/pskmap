import { useMemo } from "react";
import { freqToBand } from "../lib/bands";
import type { Spot } from "../lib/types";

interface Props {
  spots: Spot[];
}

export function StatsPanel({ spots }: Props) {
  const stats = useMemo(() => {
    if (spots.length === 0) return null;

    const receivers = new Set(spots.map((s) => s.receiverCallsign));
    const distances = spots.map((s) => s.distanceKm).filter((d): d is number => d != null);
    const snrs = spots.map((s) => s.snr).filter((s): s is number => s != null);

    const bandCounts: Record<string, number> = {};
    for (const spot of spots) {
      const band = freqToBand(spot.frequency) ?? "Other";
      bandCounts[band] = (bandCounts[band] || 0) + 1;
    }
    const topBand = Object.entries(bandCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      totalSpots: spots.length,
      uniqueReceivers: receivers.size,
      bestSnr: snrs.length ? Math.max(...snrs) : null,
      worstSnr: snrs.length ? Math.min(...snrs) : null,
      avgSnr: snrs.length ? Math.round(snrs.reduce((a, b) => a + b, 0) / snrs.length) : null,
      farthestKm: distances.length ? Math.round(Math.max(...distances)) : null,
      avgDistKm: distances.length ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length) : null,
      topBand: topBand ? `${topBand[0]} (${topBand[1]})` : null,
    };
  }, [spots]);

  if (!stats) return null;

  return (
    <div className="stats-panel">
      <div className="stat">
        <span className="stat-value">{stats.totalSpots}</span>
        <span className="stat-label">Spots</span>
      </div>
      <div className="stat">
        <span className="stat-value">{stats.uniqueReceivers}</span>
        <span className="stat-label">Receivers</span>
      </div>
      {stats.topBand && (
        <div className="stat">
          <span className="stat-value">{stats.topBand}</span>
          <span className="stat-label">Top Band</span>
        </div>
      )}
      {stats.bestSnr != null && (
        <div className="stat">
          <span className="stat-value">{stats.bestSnr} / {stats.worstSnr} / {stats.avgSnr}</span>
          <span className="stat-label">SNR Best / Worst / Avg</span>
        </div>
      )}
      {stats.farthestKm != null && (
        <div className="stat">
          <span className="stat-value">{stats.farthestKm.toLocaleString()} km</span>
          <span className="stat-label">Farthest</span>
        </div>
      )}
      {stats.avgDistKm != null && (
        <div className="stat">
          <span className="stat-value">{stats.avgDistKm.toLocaleString()} km</span>
          <span className="stat-label">Avg Distance</span>
        </div>
      )}
    </div>
  );
}
