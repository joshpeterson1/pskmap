import { useState, useMemo, useEffect, useRef } from "react";
import { freqToBand, freqToBandColor, formatFreq } from "../lib/bands";
import type { Spot, SortField, SortDir } from "../lib/types";

interface Props {
  spots: Spot[];
  selectedIndex?: number | null;
  onSelectSpot?: (index: number | null) => void;
}

interface IndexedSpot {
  spot: Spot;
  originalIndex: number;
}

export function SpotTable({ spots, selectedIndex, onSelectSpot }: Props) {
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    const arr: IndexedSpot[] = spots.map((spot, i) => ({ spot, originalIndex: i }));
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = a.spot[sortField];
      const bv = b.spot[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return arr;
  }, [spots, sortField, sortDir]);

  // Scroll selected row into view when selection changes externally (from map click)
  useEffect(() => {
    if (selectedIndex != null && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  const sortIcon = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : "";

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
          {sorted.map(({ spot, originalIndex }) => {
            const band = freqToBand(spot.frequency);
            const color = freqToBandColor(spot.frequency);
            const timeStr = spot.timestamp != null
              ? new Date(spot.timestamp * 1000).toISOString().slice(11, 19)
              : "—";
            const isSelected = selectedIndex === originalIndex;
            return (
              <tr
                key={originalIndex}
                ref={isSelected ? selectedRowRef : undefined}
                className={isSelected ? "spot-row-selected" : ""}
                style={{ borderLeft: `3px solid ${color}` }}
                onClick={() => onSelectSpot?.(isSelected ? null : originalIndex)}
              >
                <td>{timeStr}</td>
                <td>{spot.senderCallsign}</td>
                <td>{spot.receiverCallsign}</td>
                <td>{formatFreq(spot.frequency)} {band && `(${band})`}</td>
                <td>{spot.mode}</td>
                <td>{spot.snr != null ? `${spot.snr} dB` : "\u2014"}</td>
                <td>{spot.distanceKm != null ? Math.round(spot.distanceKm).toLocaleString() : "\u2014"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
