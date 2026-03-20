import { useMemo, useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Polygon, Popup, useMap } from "react-leaflet";
import { useGrayline } from "../hooks/useGrayline";
import { SOURCE_COLORS } from "../lib/external-types";
import type { ExternalSpot, SpotSource } from "../lib/external-types";
import "leaflet/dist/leaflet.css";

interface Props {
  spots: ExternalSpot[];
  selectedIndex?: number | null;
  onSelectSpot?: (index: number | null) => void;
}

function formatFreqKhz(freq: number | null): string {
  if (freq == null) return "\u2014";
  if (freq >= 1000) return (freq / 1000).toFixed(3) + " MHz";
  return freq.toFixed(1) + " kHz";
}

function MapContent({ spots, selectedIndex, onSelectSpot }: Props) {
  const map = useMap();
  const grayline = useGrayline();

  // Fix map size when container becomes visible (hidden → shown via display:none toggle)
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (map.getContainer()) {
      observer.observe(map.getContainer());
    }
    return () => observer.disconnect();
  }, [map]);

  const markers = useMemo(() => {
    return spots
      .map((spot, i) => ({ spot, index: i }))
      .filter(({ spot }) => spot.lat != null && spot.lon != null);
  }, [spots]);

  // Pan to selected spot
  useEffect(() => {
    if (selectedIndex == null) return;
    const spot = spots[selectedIndex];
    if (!spot || spot.lat == null || spot.lon == null) return;
    map.panTo([spot.lat, spot.lon], { animate: true, duration: 0.5 });
  }, [selectedIndex, spots, map]);

  return (
    <>
      <TileLayer
        url="https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />

      {grayline && (
        <Polygon
          positions={grayline}
          pathOptions={{ color: "transparent", fillColor: "#000", fillOpacity: 0.5 }}
        />
      )}

      {markers.map(({ spot, index }) => {
        const color = SOURCE_COLORS[spot.source as SpotSource] ?? "#888";
        const isSelected = selectedIndex === index;
        return (
          <CircleMarker
            key={index}
            center={[spot.lat!, spot.lon!]}
            radius={isSelected ? 7 : 5}
            pathOptions={{
              color: isSelected ? "#fff" : color,
              fillColor: color,
              fillOpacity: 0.85,
              weight: isSelected ? 2 : 1,
            }}
            eventHandlers={{
              click: () => onSelectSpot?.(isSelected ? null : index),
            }}
          >
            <Popup>
              <div style={{ fontSize: "12px", lineHeight: 1.5 }}>
                <strong>{spot.callsign}</strong>
                {spot.reference && <><br />{spot.reference}</>}
                {spot.referenceName && <><br /><em>{spot.referenceName}</em></>}
                <br />{formatFreqKhz(spot.frequency)} {spot.mode ?? ""}
                {spot.spotter && <><br />Spotter: {spot.spotter}</>}
                {spot.comments && <><br />{spot.comments}</>}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      <SourceLegend spots={spots} />
    </>
  );
}

function SourceLegend({ spots }: { spots: ExternalSpot[] }) {
  const activeSources = useMemo(() => {
    const sources = new Set(spots.map((s) => s.source as SpotSource));
    return Array.from(sources);
  }, [spots]);

  if (activeSources.length === 0) return null;

  return (
    <div className="band-legend" style={{ zIndex: 1000 }}>
      {activeSources.map((src) => (
        <div key={src} className="band-legend-item">
          <span className="band-legend-swatch" style={{ background: SOURCE_COLORS[src] }} />
          {src.toUpperCase()}
        </div>
      ))}
    </div>
  );
}

export function StationFinderMap({ spots, selectedIndex, onSelectSpot }: Props) {
  return (
    <MapContainer
      center={[20, 0]}
      zoom={3}
      minZoom={2}
      maxZoom={10}
      style={{ height: "100%", width: "100%", background: "#0d1117" }}
      preferCanvas
      worldCopyJump
    >
      <MapContent spots={spots} selectedIndex={selectedIndex} onSelectSpot={onSelectSpot} />
    </MapContainer>
  );
}
