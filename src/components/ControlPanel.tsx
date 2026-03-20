import { useState, useEffect, useRef, useCallback } from "react";
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

const STORAGE_KEY = "pskmap_prefs";
const FAVORITES_KEY = "pskmap_favorites";

// Callsign format: 1-2 letter/digit prefix, digit, 1-4 letter suffix, optional /portable
const CALLSIGN_RE = /^[A-Z0-9]{1,3}[0-9][A-Z]{1,4}(\/[A-Z0-9]+)?$/i;

interface SavedPrefs {
  callsign: string;
  band: string;
  mode: string;
  timeRange: number;
}

function loadPrefs(): Partial<SavedPrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePrefs(prefs: SavedPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFavorites(favs: string[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  } catch {}
}

const VIEW_MODES: ViewMode[] = ["map", "split", "table"];

export function ControlPanel({ onFetch, loading, viewMode, onViewModeChange, spotCount }: Props) {
  const saved = useRef(loadPrefs()).current;
  const [callsign, setCallsign] = useState(saved.callsign ?? "");
  const [band, setBand] = useState(saved.band ?? "All");
  const [mode, setMode] = useState(saved.mode ?? "All");
  const [timeRange, setTimeRange] = useState(saved.timeRange ?? 3600);
  const [favorites, setFavorites] = useState(loadFavorites);
  const [callsignError, setCallsignError] = useState<string | null>(null);
  const lastFetchRef = useRef<{ callsign: string; band: string; mode: string; timeRange: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateCallsign = (cs: string): string | null => {
    const trimmed = cs.trim();
    if (!trimmed) return null; // empty is not an error, just disables fetch
    if (trimmed.length < 3) return "Too short";
    if (!CALLSIGN_RE.test(trimmed)) return "Invalid callsign format";
    return null;
  };

  const isValid = callsign.trim().length > 0 && !validateCallsign(callsign);

  const doFetch = useCallback(() => {
    const cs = callsign.trim().toUpperCase();
    const err = validateCallsign(cs);
    if (err) {
      setCallsignError(err);
      return;
    }
    setCallsignError(null);
    lastFetchRef.current = { callsign: cs, band, mode, timeRange };
    savePrefs({ callsign: cs, band, mode, timeRange });
    onFetch(cs, band, mode, timeRange);
  }, [callsign, band, mode, timeRange, onFetch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doFetch();
  };

  const handleCallsignChange = (val: string) => {
    setCallsign(val);
    if (callsignError) setCallsignError(null);
  };

  const toggleFavorite = () => {
    const cs = callsign.trim().toUpperCase();
    if (!cs || validateCallsign(cs)) return;
    setFavorites((prev) => {
      const next = prev.includes(cs) ? prev.filter((f) => f !== cs) : [...prev, cs];
      saveFavorites(next);
      return next;
    });
  };

  const selectFavorite = (cs: string) => {
    setCallsign(cs);
    setCallsignError(null);
  };

  const removeFavorite = (cs: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.filter((f) => f !== cs);
      saveFavorites(next);
      return next;
    });
  };

  const isFaved = favorites.includes(callsign.trim().toUpperCase());

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape: clear callsign input and focus it
      if (e.key === "Escape") {
        e.preventDefault();
        setCallsign("");
        setCallsignError(null);
        inputRef.current?.focus();
        return;
      }

      // Don't intercept when typing in an input/select
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      // 1/2/3: switch view modes
      if (e.key === "1") { onViewModeChange("map"); return; }
      if (e.key === "2") { onViewModeChange("split"); return; }
      if (e.key === "3") { onViewModeChange("table"); return; }

      // /: focus callsign input
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      // r: refresh (re-fetch last query)
      if (e.key === "r" && lastFetchRef.current && !loading) {
        const last = lastFetchRef.current;
        onFetch(last.callsign, last.band, last.mode, last.timeRange);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onFetch, onViewModeChange, loading]);

  return (
    <div className="control-panel-wrapper">
      <form className="control-panel" onSubmit={handleSubmit}>
        <div className="control-group">
          <label htmlFor="callsign">Callsign</label>
          <div className="callsign-input-row">
            <input
              ref={inputRef}
              id="callsign"
              type="text"
              value={callsign}
              onChange={(e) => handleCallsignChange(e.target.value)}
              placeholder="e.g. W1AW"
              className={callsignError ? "input-error" : ""}
              autoFocus
            />
            <button
              type="button"
              className={`fav-btn ${isFaved ? "fav-btn--active" : ""}`}
              onClick={toggleFavorite}
              disabled={!isValid}
              title={isFaved ? "Remove from favorites" : "Save to favorites"}
            >
              {isFaved ? "\u2605" : "\u2606"}
            </button>
          </div>
          {callsignError && <span className="field-error">{callsignError}</span>}
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

        <button type="submit" disabled={loading || !isValid}>
          {loading ? "Loading..." : "Track"}
        </button>

        <div className="view-toggle">
          {VIEW_MODES.map((m) => (
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

      {favorites.length > 0 && (
        <div className="favorites-bar">
          {favorites.map((fav) => (
            <button
              key={fav}
              type="button"
              className={`fav-chip ${fav === callsign.trim().toUpperCase() ? "fav-chip--active" : ""}`}
              onClick={() => selectFavorite(fav)}
            >
              {fav}
              <span className="fav-chip-remove" onClick={(e) => removeFavorite(fav, e)}>&times;</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
