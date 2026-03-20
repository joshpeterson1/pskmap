import { useState, useCallback } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { MapView } from "./components/MapView";
import { SpotTable } from "./components/SpotTable";
import { StatsPanel } from "./components/StatsPanel";
import { useSpots } from "./hooks/useSpots";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import type { ViewMode } from "./lib/types";
import "./App.css";

function App() {
  const { spots, loading, error, hasFetched, mqttStatus, fetchSpots } = useSpots();
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const online = useOnlineStatus();

  const handleFetch = useCallback(
    (callsign: string, bands: string[], modes: string[], timeRange: number) => {
      setSelectedSpot(null);
      fetchSpots({
        callsign,
        bands,
        modes,
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

      {!online && <div className="offline-bar">No internet connection — map tiles and fetches will fail until connectivity is restored.</div>}
      {mqttStatus === "disconnected" && online && <div className="warning-bar">MQTT disconnected — reconnecting...</div>}
      {error && <div className="error-bar">{error}</div>}
      {hasFetched && !loading && !error && spots.length === 0 && (
        <div className="info-bar">No spots found. The callsign may not have been active in the selected time range.</div>
      )}

      {spots.length > 0 && <StatsPanel spots={spots} />}

      <div className={`content content--${viewMode}`}>
        {(viewMode === "map" || viewMode === "split") && (
          <div className="pane pane--map">
            <MapView spots={spots} selectedIndex={selectedSpot} onSelectSpot={setSelectedSpot} />
          </div>
        )}
        {(viewMode === "table" || viewMode === "split") && (
          <div className="pane pane--table">
            <SpotTable spots={spots} selectedIndex={selectedSpot} onSelectSpot={setSelectedSpot} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
