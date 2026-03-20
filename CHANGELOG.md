# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Initial Tauri v2 application scaffold with React + TypeScript frontend
- PSKreporter API integration (Rust backend) for fetching reception reports
- Dark-themed Leaflet map with CartoDB Dark Matter tiles
- Solar terminator (grayline) overlay on map, updating every 60 seconds
- Spot markers on map colored by band, with lines from sender to receiver
- Sortable spot table with columns: time, TX, RX, frequency/band, mode, SNR, distance
- Control panel with callsign input, band/mode/time range selectors
- Three view modes: Map, Table, and Split (map + table)
- Maidenhead grid square to lat/lon conversion
- Haversine distance calculation between stations
- Auto-refresh with configurable interval (5 min, 10 min, 15 min) compliant with PSKreporter's 5-min minimum
- Response caching (5-min TTL) matching PSKreporter's data update cycle
- Humanized error messages for timeouts, network failures, and rate limits
- Propagation statistics panel (spots, unique receivers, SNR best/worst/avg, farthest contact, top band)
- Marker clustering for large result sets using react-leaflet-cluster
- State persistence via localStorage (callsign, band, mode, time range remembered across sessions)
- Callsign format validation with inline error feedback
- Offline detection banner when internet connectivity is lost
- Saved callsign favorites with star toggle and quick-switch chip bar
- Keyboard shortcuts: `/` focus callsign, `Esc` clear, `1`/`2`/`3` switch views, `r` refresh
- Auto-fit map viewport to spot bounds on callsign change (preserves manual zoom on refresh)
- Sender station "you are here" marker (blue with white border) at your grid position
- Zoom-aware signal lines: hidden at low zoom to avoid clutter with clusters, fade in as you zoom
- Band legend overlay on map showing active band colors
- SNR-based marker sizing: stronger signals render as larger dots (3–8px range)
- Time-decay opacity: newer spots are brighter, older spots fade
- Great circle arcs via leaflet.geodesic: signal lines now follow Earth curvature and handle antimeridian correctly
- Table ↔ map cross-highlight: click a table row to highlight its marker on the map, click a marker to highlight its table row

### Changed
- Reduced grayline polygon vertices for better performance
- Signal lines rendered imperatively via LayerGroup for better performance with large spot counts
- **Real-time MQTT streaming backend (replaces HTTP polling):**
  - Connect to `mqtt.pskreporter.info:1883` for live spot streaming
  - Subscribe to `pskr/filter/v2/+/+/{CALLSIGN}/#` — spots arrive in real-time as JSON
  - HTTP retrieve API kept for 24h historical backfill on initial subscribe
  - Auto-reconnect with topic re-subscription on connection recovery
  - Removed auto-refresh UI — MQTT is push-based, no polling needed
  - "Fetch" button renamed to "Track" to reflect streaming model
  - MQTT connection status indicator shown when disconnected
  - Client-side filtering unchanged — band, mode, and time range applied locally
  - New spot fields from MQTT: sender/receiver ADIF country codes
  - Spots deduplicated by receiver+frequency+timestamp to prevent duplicates between backfill and stream
