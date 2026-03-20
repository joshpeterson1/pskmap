import { useMemo } from "react";
import type { SpotSource, ExternalSpot } from "../lib/external-types";
import { SOURCE_LABELS } from "../lib/external-types";
import { freqToBand } from "../lib/bands";
import type { ViewMode } from "../lib/types";

const ALL_SOURCES: { id: SpotSource; enabled: boolean }[] = [
  { id: "pota", enabled: true },
  { id: "sota", enabled: true },
  { id: "rbn", enabled: false },
  { id: "dxcluster", enabled: false },
];

const VIEW_MODES: ViewMode[] = ["map", "split", "table"];

function toggleInArray(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
}

/** Extract program prefix from reference (e.g. "K-1234" → "K", "US-1234" → "US", "JA-1234" → "JA") */
function getProgram(ref: string | null): string | null {
  if (!ref) return null;
  const idx = ref.indexOf("-");
  return idx > 0 ? ref.slice(0, idx) : null;
}

interface Props {
  enabledSources: SpotSource[];
  onToggleSource: (source: SpotSource) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  filteredCount: number;
  totalCount: number;
  loading: boolean;
  lastRefresh: number | null;
  onRefresh: () => void;
  spots: ExternalSpot[];
  filterBands: string[];
  onFilterBandsChange: (bands: string[]) => void;
  filterPrograms: string[];
  onFilterProgramsChange: (programs: string[]) => void;
  filterModes: string[];
  onFilterModesChange: (modes: string[]) => void;
}

export function StationFinderControls({
  enabledSources,
  onToggleSource,
  viewMode,
  onViewModeChange,
  filteredCount,
  totalCount,
  loading,
  lastRefresh,
  onRefresh,
  spots,
  filterBands,
  onFilterBandsChange,
  filterPrograms,
  onFilterProgramsChange,
  filterModes,
  onFilterModesChange,
}: Props) {
  const refreshAgo = lastRefresh
    ? `${Math.floor((Date.now() - lastRefresh) / 1000)}s ago`
    : null;

  // Derive available options from current spots
  const availableBands = useMemo(() => {
    const set = new Set<string>();
    for (const s of spots) {
      if (s.frequency != null) {
        // POTA frequency is in kHz, convert to Hz for freqToBand
        const band = freqToBand(s.frequency * 1000);
        if (band) set.add(band);
      }
    }
    return Array.from(set).sort((a, b) => {
      const order = ["160m", "80m", "60m", "40m", "30m", "20m", "17m", "15m", "12m", "10m", "6m", "2m"];
      return order.indexOf(a) - order.indexOf(b);
    });
  }, [spots]);

  const availablePrograms = useMemo(() => {
    const set = new Set<string>();
    for (const s of spots) {
      const prog = getProgram(s.reference);
      if (prog) set.add(prog);
    }
    return Array.from(set).sort();
  }, [spots]);

  const availableModes = useMemo(() => {
    const set = new Set<string>();
    for (const s of spots) {
      if (s.mode) set.add(s.mode.toUpperCase());
    }
    return Array.from(set).sort();
  }, [spots]);

  return (
    <div className="sf-controls-wrapper">
      <div className="sf-controls">
        <div className="sf-sources">
          <label>Sources</label>
          <div className="multi-select">
            {ALL_SOURCES.map(({ id, enabled }) => (
              <button
                key={id}
                type="button"
                className={`chip ${enabledSources.includes(id) ? "chip--active" : ""} ${!enabled ? "chip--disabled" : ""}`}
                onClick={() => enabled && onToggleSource(id)}
                title={!enabled ? "Coming soon" : SOURCE_LABELS[id]}
                disabled={!enabled}
              >
                {SOURCE_LABELS[id]}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="sf-refresh-btn"
          onClick={onRefresh}
          disabled={loading || enabledSources.length === 0}
          title={refreshAgo ? `Last refresh: ${refreshAgo}` : "Refresh"}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>

        <span className="sf-spot-count">
          {filteredCount === totalCount
            ? `${totalCount} station${totalCount !== 1 ? "s" : ""}`
            : `${filteredCount} / ${totalCount} stations`}
        </span>

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
      </div>

      {spots.length > 0 && (
        <div className="sf-filters">
          {availableBands.length > 1 && (
            <div className="sf-filter-group">
              <label>Band {filterBands.length > 0 && <span className="filter-count">({filterBands.length})</span>}</label>
              <div className="multi-select">
                {availableBands.map((b) => (
                  <button
                    key={b}
                    type="button"
                    className={`chip ${filterBands.includes(b) ? "chip--active" : ""}`}
                    onClick={() => onFilterBandsChange(toggleInArray(filterBands, b))}
                  >
                    {b}
                  </button>
                ))}
                {filterBands.length > 0 && (
                  <button type="button" className="chip chip--clear" onClick={() => onFilterBandsChange([])}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {availablePrograms.length > 1 && (
            <div className="sf-filter-group">
              <label>Program {filterPrograms.length > 0 && <span className="filter-count">({filterPrograms.length})</span>}</label>
              <div className="multi-select">
                {availablePrograms.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`chip ${filterPrograms.includes(p) ? "chip--active" : ""}`}
                    onClick={() => onFilterProgramsChange(toggleInArray(filterPrograms, p))}
                  >
                    {p}
                  </button>
                ))}
                {filterPrograms.length > 0 && (
                  <button type="button" className="chip chip--clear" onClick={() => onFilterProgramsChange([])}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {availableModes.length > 1 && (
            <div className="sf-filter-group">
              <label>Mode {filterModes.length > 0 && <span className="filter-count">({filterModes.length})</span>}</label>
              <div className="multi-select">
                {availableModes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`chip ${filterModes.includes(m) ? "chip--active" : ""}`}
                    onClick={() => onFilterModesChange(toggleInArray(filterModes, m))}
                  >
                    {m}
                  </button>
                ))}
                {filterModes.length > 0 && (
                  <button type="button" className="chip chip--clear" onClick={() => onFilterModesChange([])}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
