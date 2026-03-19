import { useState, useMemo } from "react";
import { freqToBand, freqToBandColor, formatFreq } from "../lib/bands";
import type { Spot, SortField, SortDir } from "../lib/types";

interface Props {
  spots: Spot[];
}

export function SpotTable({ spots }: Props) {
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    const arr = [...spots];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return arr;
  }, [spots, sortField, sortDir]);

  const sortIcon = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="spot-table-container">
      <table className="spot-table">
        <thead>
          <tr>
            <th onClick={() => toggleSort("timestamp")}>Time (UTC){sortIcon("timestamp")}</th>
            <th onClick={() => toggleSort("senderCallsign")}>TX{sortIcon("senderCallsign")}</th>
            <th onClick={() => toggleSort("receiverCallsign")}>RX{sortIcon("receiverCallsign")}</th>
            <th onClick={() => toggleSort("frequency")}>Freq / Band{sortIcon("frequency")}</th>
            <th onClick={() => toggleSort("mode")}>Mode{sortIcon("mode")}</th>
            <th onClick={() => toggleSort("snr")}>SNR{sortIcon("snr")}</th>
            <th onClick={() => toggleSort("distanceKm")}>Dist (km){sortIcon("distanceKm")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((spot, i) => {
            const band = freqToBand(spot.frequency);
            const color = freqToBandColor(spot.frequency);
            const time = new Date(spot.timestamp * 1000);
            const timeStr = time.toISOString().slice(11, 19);
            return (
              <tr key={i} style={{ borderLeft: `3px solid ${color}` }}>
                <td>{timeStr}</td>
                <td>{spot.senderCallsign}</td>
                <td>{spot.receiverCallsign}</td>
                <td>{formatFreq(spot.frequency)} {band && `(${band})`}</td>
                <td>{spot.mode}</td>
                <td>{spot.snr != null ? `${spot.snr} dB` : "—"}</td>
                <td>{spot.distanceKm != null ? Math.round(spot.distanceKm).toLocaleString() : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
