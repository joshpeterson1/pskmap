import { useState, useCallback } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { MapView } from "./components/MapView";
import { SpotTable } from "./components/SpotTable";
import { useSpots } from "./hooks/useSpots";
import type { ViewMode } from "./lib/types";
import "./App.css";

function App() {
  const { spots, loading, error, hasFetched, fetchSpots } = useSpots();
  const [viewMode, setViewMode] = useState<ViewMode>("split");

  const handleFetch = useCallback(
    (callsign: string, band: string, mode: string, timeRange: number) => {
      fetchSpots({
        callsign,
        band: band === "All" ? null : band,
        mode: mode === "All" ? null : mode,
        timeRangeSeconds: timeRange,
      });
    },
    [fetchSpots]
  );

  return (
    <div className="app">
      <ControlPanel
        onFetch={handleFetch}
        loading={loading}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        spotCount={spots.length}
      />

      {error && <div className="error-bar">{error}</div>}
      {hasFetched && !loading && !error && spots.length === 0 && (
        <div className="info-bar">No spots found. The callsign may not have been active in the selected time range.</div>
      )}

      <div className={`content content--${viewMode}`}>
        {(viewMode === "map" || viewMode === "split") && (
          <div className="pane pane--map">
            <MapView spots={spots} />
          </div>
        )}
        {(viewMode === "table" || viewMode === "split") && (
          <div className="pane pane--table">
            <SpotTable spots={spots} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
