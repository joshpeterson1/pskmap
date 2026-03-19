import { MapContainer, TileLayer, CircleMarker, Polyline, Polygon, Popup } from "react-leaflet";
import { useGrayline } from "../hooks/useGrayline";
import { freqToBandColor, freqToBand, formatFreq } from "../lib/bands";
import type { Spot } from "../lib/types";
import "leaflet/dist/leaflet.css";

interface Props {
  spots: Spot[];
}

/**
 * Adjust receiver longitude so the polyline takes the shortest path.
 * If the longitude difference is > 180, wrap by ±360.
 */
function shortestPathLon(senderLon: number, receiverLon: number): number {
  let diff = receiverLon - senderLon;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return senderLon + diff;
}

export function MapView({ spots }: Props) {
  const grayline = useGrayline();

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
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {/* Grayline overlay */}
      <Polygon
        positions={grayline}
        pathOptions={{
          fillColor: "#000000",
          fillOpacity: 0.35,
          stroke: false,
        }}
      />

      {/* Spot lines and markers */}
      {spots.map((spot, i) => {
        const hasReceiver = spot.receiverLat != null && spot.receiverLon != null;
        const hasSender = spot.senderLat != null && spot.senderLon != null;
        const color = freqToBandColor(spot.frequency);

        // Compute shortest-path adjusted longitude for the line
        const adjustedReceiverLon =
          hasSender && hasReceiver
            ? shortestPathLon(spot.senderLon!, spot.receiverLon!)
            : spot.receiverLon;

        return (
          <span key={i}>
            {/* Line from sender to receiver */}
            {hasSender && hasReceiver && (
              <Polyline
                positions={[
                  [spot.senderLat!, spot.senderLon!],
                  [spot.receiverLat!, adjustedReceiverLon!],
                ]}
                pathOptions={{ color, weight: 1, opacity: 0.3 }}
              />
            )}

            {/* Receiver marker */}
            {hasReceiver && (
              <CircleMarker
                center={[spot.receiverLat!, spot.receiverLon!]}
                radius={4}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: 1 }}
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
                    {new Date(spot.timestamp * 1000).toUTCString()}
                  </div>
                </Popup>
              </CircleMarker>
            )}
          </span>
        );
      })}
    </MapContainer>
  );
}
