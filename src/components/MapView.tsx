import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Polygon, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import { GeodesicLine } from "leaflet.geodesic";
import { useGrayline } from "../hooks/useGrayline";
import { freqToBandColor, freqToBand, formatFreq, BANDS } from "../lib/bands";
import type { Spot } from "../lib/types";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

interface Props {
  spots: Spot[];
  selectedIndex?: number | null;
  onSelectSpot?: (index: number | null) => void;
}

/** Map SNR to marker radius: -30 dB → 3px, +30 dB → 8px, null → 4px */
function snrToRadius(snr: number | null): number {
  if (snr == null) return 4;
  const clamped = Math.max(-30, Math.min(30, snr));
  return 3 + ((clamped + 30) / 60) * 5;
}

/** Time-decay: newest spots are fully opaque, oldest fade. Returns 0.3–0.9. */
function timeDecayOpacity(timestamp: number | null, oldest: number, newest: number): number {
  if (timestamp == null) return 0.7; // receiver-only spots get mid opacity
  if (newest === oldest) return 0.9;
  const t = (timestamp - oldest) / (newest - oldest);
  return 0.3 + t * 0.6;
}

/** Imperatively manages geodesic arc layers for performance */
function GeodesicArcs({ spots, lineOpacity, timeRange }: {
  spots: Spot[];
  lineOpacity: number;
  timeRange: { oldest: number; newest: number };
}) {
  const map = useMap();
  const groupRef = useRef(L.layerGroup());

  useEffect(() => {
    groupRef.current.addTo(map);
    return () => { groupRef.current.remove(); };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    group.clearLayers();
    if (lineOpacity <= 0) return;

    for (const spot of spots) {
      if (spot.senderLat == null || spot.senderLon == null) continue;
      if (spot.receiverLat == null || spot.receiverLon == null) continue;

      const color = freqToBandColor(spot.frequency);
      const decay = timeDecayOpacity(spot.timestamp, timeRange.oldest, timeRange.newest);
      const opacity = lineOpacity * (decay / 0.9);

      const line = new GeodesicLine(
        [[spot.senderLat, spot.senderLon], [spot.receiverLat, spot.receiverLon]],
        { color, weight: 1, opacity, steps: 2, wrap: true }
      );
      group.addLayer(line);
    }
  }, [spots, lineOpacity, timeRange]);

  return null;
}

function BandLegend({ spots }: { spots: Spot[] }) {
  const activeBands = useMemo(() => {
    const seen = new Set<string>();
    for (const s of spots) {
      const b = freqToBand(s.frequency);
      if (b) seen.add(b);
    }
    return Object.entries(BANDS).filter(([name]) => seen.has(name));
  }, [spots]);

  if (activeBands.length === 0) return null;

  return (
    <div className="band-legend">
      {activeBands.map(([name, info]) => (
        <div key={name} className="band-legend-item">
          <span className="band-legend-dot" style={{ backgroundColor: info.color }} />
          <span>{name}</span>
        </div>
      ))}
    </div>
  );
}

function MapContent({ spots, selectedIndex, onSelectSpot }: Props) {
  const map = useMap();
  const grayline = useGrayline();
  const [zoom, setZoom] = useState(map.getZoom());
  const prevCallsignRef = useRef("");

  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoomend", onZoom);
    return () => { map.off("zoomend", onZoom); };
  }, [map]);

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

  // Auto-fit bounds when callsign changes (not on auto-refresh)
  useEffect(() => {
    if (spots.length === 0) return;
    const cs = spots[0]?.senderCallsign ?? "";
    if (cs === prevCallsignRef.current) return;
    prevCallsignRef.current = cs;

    const lats: number[] = [];
    const lons: number[] = [];
    for (const s of spots) {
      if (s.receiverLat != null && s.receiverLon != null) {
        lats.push(s.receiverLat);
        lons.push(s.receiverLon);
      }
      if (s.senderLat != null && s.senderLon != null) {
        lats.push(s.senderLat);
        lons.push(s.senderLon);
      }
    }
    if (lats.length >= 2) {
      const bounds: LatLngBoundsExpression = [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ];
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
    }
  }, [spots, map]);

  const senderPos = useMemo(() => {
    for (const s of spots) {
      if (s.senderLat != null && s.senderLon != null)
        return [s.senderLat, s.senderLon] as [number, number];
    }
    return null;
  }, [spots]);

  const senderCallsign = spots[0]?.senderCallsign ?? "";
  const senderGrid = spots.find((s) => s.senderLocator)?.senderLocator ?? "";

  const timeRange = useMemo(() => {
    if (spots.length === 0) return { oldest: 0, newest: 0 };
    let oldest = Infinity, newest = -Infinity;
    for (const s of spots) {
      if (s.timestamp == null) continue;
      if (s.timestamp < oldest) oldest = s.timestamp;
      if (s.timestamp > newest) newest = s.timestamp;
    }
    if (oldest === Infinity) return { oldest: 0, newest: 0 };
    return { oldest, newest };
  }, [spots]);

  const lineOpacity = zoom < 4 ? 0 : zoom < 6 ? 0.15 : 0.3;

  // Pan to selected spot
  useEffect(() => {
    if (selectedIndex == null) return;
    const spot = spots[selectedIndex];
    if (!spot || spot.receiverLat == null || spot.receiverLon == null) return;
    map.panTo([spot.receiverLat, spot.receiverLon], { animate: true, duration: 0.5 });
  }, [selectedIndex, spots, map]);

  const handleMarkerClick = useCallback((index: number) => {
    onSelectSpot?.(selectedIndex === index ? null : index);
  }, [onSelectSpot, selectedIndex]);

  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      <Polygon
        positions={grayline}
        pathOptions={{ fillColor: "#000000", fillOpacity: 0.35, stroke: false }}
      />

      {/* Geodesic signal arcs — zoom-aware, time-decayed */}
      <GeodesicArcs spots={spots} lineOpacity={lineOpacity} timeRange={timeRange} />

      {/* Sender station marker */}
      {senderPos && (
        <CircleMarker
          center={senderPos}
          radius={7}
          pathOptions={{
            color: "#ffffff",
            fillColor: "#58a6ff",
            fillOpacity: 1,
            weight: 2,
          }}
        >
          <Popup>
            <div className="spot-popup">
              <strong>{senderCallsign}</strong> (you)
              {senderGrid && <><br />Grid: {senderGrid}</>}
            </div>
          </Popup>
        </CircleMarker>
      )}

      {/* Clustered receiver markers — SNR-sized, time-decayed, selectable */}
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={40}
        spiderfyOnMaxZoom
        showCoverageOnHover={false}
      >
        {spots.map((spot, i) => {
          const hasReceiver = spot.receiverLat != null && spot.receiverLon != null;
          if (!hasReceiver) return null;
          const color = freqToBandColor(spot.frequency);
          const isSelected = selectedIndex === i;
          const radius = isSelected ? 8 : snrToRadius(spot.snr);
          const decay = timeDecayOpacity(spot.timestamp, timeRange.oldest, timeRange.newest);
          return (
            <CircleMarker
              key={`marker-${i}`}
              center={[spot.receiverLat!, spot.receiverLon!]}
              radius={radius}
              pathOptions={{
                color: isSelected ? "#ffffff" : color,
                fillColor: color,
                fillOpacity: isSelected ? 1 : decay,
                weight: isSelected ? 2 : 1,
              }}
              eventHandlers={{ click: () => handleMarkerClick(i) }}
            >
              <Popup>
                <div className="spot-popup">
                  <strong>{spot.receiverCallsign}</strong>
                  <br />
                  heard <strong>{spot.senderCallsign}</strong>
                  <br />
                  {formatFreq(spot.frequency)} ({freqToBand(spot.frequency) || "?"})
                  <br />
                  Mode: {spot.mode}
                  {spot.snr != null && <><br />SNR: {spot.snr} dB</>}
                  {spot.distanceKm != null && <><br />Dist: {Math.round(spot.distanceKm)} km</>}
                  <br />
                  {spot.timestamp != null ? new Date(spot.timestamp * 1000).toUTCString() : "Active receiver"}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MarkerClusterGroup>
    </>
  );
}

export function MapView({ spots, selectedIndex, onSelectSpot }: Props) {
  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={2}
      maxZoom={10}
      style={{ width: "100%", height: "100%" }}
      preferCanvas={true}
      worldCopyJump={true}
    >
      <MapContent spots={spots} selectedIndex={selectedIndex} onSelectSpot={onSelectSpot} />
      <BandLegend spots={spots} />
    </MapContainer>
  );
}
