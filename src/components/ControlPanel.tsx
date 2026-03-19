import { useState } from "react";
import { BAND_NAMES } from "../lib/bands";
import { MODES } from "../lib/modes";
import type { ViewMode } from "../lib/types";

interface Props {
  onFetch: (callsign: string, band: string, mode: string, timeRange: number) => void;
  loading: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  spotCount: number;
}

const TIME_RANGES = [
  { label: "15 min", value: 900 },
  { label: "30 min", value: 1800 },
  { label: "1 hour", value: 3600 },
  { label: "2 hours", value: 7200 },
  { label: "6 hours", value: 21600 },
  { label: "12 hours", value: 43200 },
  { label: "24 hours", value: 86400 },
];

export function ControlPanel({ onFetch, loading, viewMode, onViewModeChange, spotCount }: Props) {
  const [callsign, setCallsign] = useState("");
  const [band, setBand] = useState("All");
  const [mode, setMode] = useState("All");
  const [timeRange, setTimeRange] = useState(3600);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callsign.trim()) return;
    onFetch(callsign.trim().toUpperCase(), band, mode, timeRange);
  };

  return (
    <form className="control-panel" onSubmit={handleSubmit}>
      <div className="control-group">
        <label htmlFor="callsign">Callsign</label>
        <input
          id="callsign"
          type="text"
          value={callsign}
          onChange={(e) => setCallsign(e.target.value)}
          placeholder="e.g. W1AW"
          autoFocus
        />
      </div>

      <div className="control-group">
        <label htmlFor="band">Band</label>
        <select id="band" value={band} onChange={(e) => setBand(e.target.value)}>
          {BAND_NAMES.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      <div className="control-group">
        <label htmlFor="mode">Mode</label>
        <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="control-group">
        <label htmlFor="time">Time</label>
        <select id="time" value={timeRange} onChange={(e) => setTimeRange(Number(e.target.value))}>
          {TIME_RANGES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <button type="submit" disabled={loading || !callsign.trim()}>
        {loading ? "Loading..." : "Fetch"}
      </button>

      <div className="view-toggle">
        {(["map", "split", "table"] as ViewMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={viewMode === m ? "active" : ""}
            onClick={() => onViewModeChange(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <span className="spot-count">
        {spotCount} spot{spotCount !== 1 ? "s" : ""}
      </span>
    </form>
  );
}
