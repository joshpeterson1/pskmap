import { useState, useCallback, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StationFinderControls } from "./StationFinderControls";
import { StationFinderMap } from "./StationFinderMap";
import { StationFinderTable } from "./StationFinderTable";
import { useExternalSpots } from "../hooks/useExternalSpots";
import { freqToBand } from "../lib/bands";
import type { ExternalSpot, SpotSource } from "../lib/external-types";
import type { ViewMode } from "../lib/types";

function getProgram(ref: string | null): string | null {
  if (!ref) return null;
  const idx = ref.indexOf("-");
  if (idx <= 0) return null;
  // For SOTA references like "S5/CP-004", extract the association prefix
  const prefix = ref.slice(0, idx);
  // If it contains a slash (SOTA format), use the part before the slash
  const slashIdx = prefix.indexOf("/");
  return slashIdx > 0 ? prefix.slice(0, slashIdx) : prefix;
}

function filterSpots(
  spots: ExternalSpot[],
  bands: string[],
  programs: string[],
  modes: string[]
): ExternalSpot[] {
  return spots.filter((s) => {
    if (bands.length > 0) {
      const band = s.frequency != null ? freqToBand(s.frequency * 1000) : null;
      if (!band || !bands.includes(band)) return false;
    }
    if (programs.length > 0) {
      const prog = getProgram(s.reference);
      if (!prog || !programs.includes(prog)) return false;
    }
    if (modes.length > 0) {
      if (!s.mode || !modes.includes(s.mode.toUpperCase())) return false;
    }
    return true;
  });
}

export function StationFinderSection() {
  const [enabledSources, setEnabledSources] = useState<SpotSource[]>(["pota"]);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [filterBands, setFilterBands] = useState<string[]>([]);
  const [filterPrograms, setFilterPrograms] = useState<string[]>([]);
  const [filterModes, setFilterModes] = useState<string[]>([]);
  const [sotaUpdateNeeded, setSotaUpdateNeeded] = useState(false);
  const [sotaDownloading, setSotaDownloading] = useState(false);
  const { spots: rawSpots, loading, error, lastRefresh, refresh } = useExternalSpots(enabledSources);

  // Check if SOTA summits need updating on mount
  useEffect(() => {
    invoke<boolean>("check_sota_update").then(setSotaUpdateNeeded).catch(() => {});
  }, []);

  const handleSotaDownload = useCallback(async () => {
    setSotaDownloading(true);
    try {
      await invoke("download_sota_summits");
      setSotaUpdateNeeded(false);
      // If SOTA is enabled, refresh to pick up new data
      if (enabledSources.includes("sota")) {
        refresh();
      }
    } catch (e) {
      console.error("SOTA download failed:", e);
    } finally {
      setSotaDownloading(false);
    }
  }, [enabledSources, refresh]);

  const spots = useMemo(
    () => filterSpots(rawSpots, filterBands, filterPrograms, filterModes),
    [rawSpots, filterBands, filterPrograms, filterModes]
  );

  const toggleSource = useCallback((source: SpotSource) => {
    setEnabledSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
    setSelectedSpot(null);
  }, []);

  return (
    <>
      <StationFinderControls
        enabledSources={enabledSources}
        onToggleSource={toggleSource}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filteredCount={spots.length}
        totalCount={rawSpots.length}
        loading={loading}
        lastRefresh={lastRefresh}
        onRefresh={refresh}
        spots={rawSpots}
        filterBands={filterBands}
        onFilterBandsChange={setFilterBands}
        filterPrograms={filterPrograms}
        onFilterProgramsChange={setFilterPrograms}
        filterModes={filterModes}
        onFilterModesChange={setFilterModes}
      />

      {sotaUpdateNeeded && (
        <div className="info-bar sota-update-bar">
          SOTA summit database needs updating.
          <button
            className="sota-update-btn"
            onClick={handleSotaDownload}
            disabled={sotaDownloading}
          >
            {sotaDownloading ? "Downloading..." : "Download (~25 MB)"}
          </button>
        </div>
      )}

      {error && <div className="error-bar">{error}</div>}
      {!loading && !error && spots.length === 0 && enabledSources.length > 0 && !sotaUpdateNeeded && (
        <div className="info-bar">No active stations found.</div>
      )}

      <div className={`content content--${viewMode}`}>
        {(viewMode === "map" || viewMode === "split") && (
          <div className="pane pane--map">
            <StationFinderMap spots={spots} selectedIndex={selectedSpot} onSelectSpot={setSelectedSpot} />
          </div>
        )}
        {(viewMode === "table" || viewMode === "split") && (
          <div className="pane pane--table">
            <StationFinderTable spots={spots} selectedIndex={selectedSpot} onSelectSpot={setSelectedSpot} />
          </div>
        )}
      </div>
    </>
  );
}
