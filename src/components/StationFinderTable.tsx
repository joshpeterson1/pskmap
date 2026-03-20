import { useState, useMemo, useEffect, useRef } from "react";
import { SOURCE_COLORS, SOURCE_LABELS } from "../lib/external-types";
import type { ExternalSpot, SpotSource } from "../lib/external-types";
import { getFlagUrl } from "../lib/program-flags";

interface Props {
  spots: ExternalSpot[];
  selectedIndex?: number | null;
  onSelectSpot?: (index: number | null) => void;
}

type SortField = "source" | "callsign" | "reference" | "frequency" | "mode" | "spotter" | "timestamp";
type SortDir = "asc" | "desc";

function formatTimeDelta(timestamp: number | null): string {
  if (timestamp == null) return "\u2014";
  const delta = Math.floor(Date.now() / 1000) - timestamp;
  if (delta < 0) return "just now";
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  const h = Math.floor(delta / 3600);
  const m = Math.floor((delta % 3600) / 60);
  return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
}

function formatFreqKhz(freq: number | null): string {
  if (freq == null) return "\u2014";
  if (freq >= 1000) return (freq / 1000).toFixed(3) + " MHz";
  return freq.toFixed(1) + " kHz";
}

export function StationFinderTable({ spots, selectedIndex, onSelectSpot }: Props) {
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const [, setTick] = useState(0);

  // Tick every 10s for time delta freshness
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    const arr = spots.map((spot, i) => ({ spot, index: i }));
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
            <th onClick={() => toggleSort("source")}>Source{sortIcon("source")}</th>
            <th onClick={() => toggleSort("callsign")}>Callsign{sortIcon("callsign")}</th>
            <th onClick={() => toggleSort("reference")}>Reference{sortIcon("reference")}</th>
            <th onClick={() => toggleSort("frequency")}>Freq{sortIcon("frequency")}</th>
            <th onClick={() => toggleSort("mode")}>Mode{sortIcon("mode")}</th>
            <th onClick={() => toggleSort("spotter")}>Spotter{sortIcon("spotter")}</th>
            <th onClick={() => toggleSort("timestamp")}>Ago{sortIcon("timestamp")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ spot, index }) => {
            const isSelected = selectedIndex === index;
            const color = SOURCE_COLORS[spot.source as SpotSource] ?? "#888";
            return (
              <tr
                key={index}
                ref={isSelected ? selectedRowRef : undefined}
                className={isSelected ? "spot-row-selected" : ""}
                style={{ borderLeft: `3px solid ${color}` }}
                onClick={() => onSelectSpot?.(isSelected ? null : index)}
              >
                <td>{SOURCE_LABELS[spot.source as SpotSource] ?? spot.source}</td>
                <td style={{ fontWeight: 700 }}>{spot.callsign}</td>
                <td title={spot.referenceName ?? undefined} className="td-reference">
                  {spot.reference ? (
                    <>
                      {getFlagUrl(spot.reference) && (
                        <img
                          src={getFlagUrl(spot.reference)!}
                          alt=""
                          className="ref-flag"
                        />
                      )}
                      {spot.reference}
                    </>
                  ) : "\u2014"}
                </td>
                <td>{formatFreqKhz(spot.frequency)}</td>
                <td>{spot.mode ?? "\u2014"}</td>
                <td>{spot.spotter ?? "\u2014"}</td>
                <td className="td-ago">{formatTimeDelta(spot.timestamp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
