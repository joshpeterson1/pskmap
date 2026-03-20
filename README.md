# PSKmap

A desktop app for ham radio operators with two main features:

1. **My Signal** — See who hears your signal in real-time via [PSKreporter](https://pskreporter.info) MQTT streaming
2. **Station Finder** — Discover active POTA and SOTA stations on a live map

Built with Tauri v2 (Rust + React).

## Features

### My Signal
- **Real-time spot streaming** — MQTT push from PSKreporter, no polling
- **SQLite caching** — Spots persist across app restarts, incremental fetch via `lastSequenceNumber`
- **Dark world map** — CartoDB tiles with band-colored markers, geodesic signal arcs, and marker clustering
- **Grayline overlay** — Solar terminator updates every 60 seconds
- **Sortable spot table** — Time, time delta, callsigns, frequency/band, mode, SNR, distance
- **Split view** — Map only, table only, or both side by side
- **Dynamic filters** — Band and mode chips derived from your actual data
- **Time range** — 1 min to 24 hours
- **Stats panel** — Total spots, unique receivers, SNR best/worst/avg, farthest contact, top band
- **Favorites** — Save callsigns for quick switching
- **Keyboard shortcuts** — `/` focus search, `1`/`2`/`3` switch views, `r` re-fetch, `Esc` clear
- **Cross-highlighting** — Click a table row to pan the map there, and vice versa

### Station Finder
- **POTA spots** — Live activator data from `api.pota.app` with country flag icons
- **SOTA spots** — Live spots from `api2.sota.org.uk` with summit coordinates from cached CSV (~25 MB, refreshed every 90 days)
- **Source toggles** — Enable/disable POTA, SOTA independently (RBN, DXCluster coming soon)
- **Dynamic filters** — Band, program (country prefix), and mode chips derived from results
- **Auto-refresh** — Spots update every 60 seconds
- **Map + table** — Same split view system as My Signal, with source-colored markers

### General
- **Sidebar navigation** — Icon rail to switch between My Signal and Station Finder
- **State preservation** — Both sections stay mounted; switching tabs preserves all data and filters
- **Dark theme** — Consistent dark UI across all views

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Usage

### My Signal
1. Enter your callsign (e.g. `W1AW`) and click **Track**
2. The app subscribes to PSKreporter's MQTT stream for your callsign
3. Spots appear on the map and table as they arrive in real-time
4. Use band, mode, and time range filters to narrow results
5. Star a callsign to save it to favorites for quick access
6. On next launch, cached spots load instantly — only new spots are fetched

### Station Finder
1. Click the search icon in the sidebar
2. Toggle POTA and/or SOTA source chips
3. For SOTA, download the summit database when prompted (~25 MB, one-time)
4. Active stations appear on the map with source-colored markers
5. Filter by band, program (country), or mode
6. Click a table row to pan the map to that station

## How It Works

### My Signal — PSKreporter

| Source | Purpose | Reliability |
|--------|---------|-------------|
| **MQTT** (`mqtt.pskreporter.info:1883`) | Real-time spot stream | Primary, reliable |
| **HTTPS** (`pskreporter.info/cgi-bin/pskquery5.pl`) | Historical backfill (JSONP) | Works with correct params + headers |
| **SQLite** (`{app_data_dir}/pskmap.db`) | Spot cache + incremental fetch | Local, persistent |

First launch pulls 24h of history. Subsequent launches use `lastSequenceNumber` for incremental fetch — only new spots since last session. All spots (MQTT + HTTP) are persisted to SQLite. 14-day retention with automatic pruning.

### Station Finder — POTA & SOTA

| Source | Endpoint | Coordinates | Refresh |
|--------|----------|-------------|---------|
| **POTA** | `api.pota.app/spot/activator` | Included in response (park location) | 60s polling, 30s cache |
| **SOTA** | `api2.sota.org.uk/api/spots/60/all` | Joined from `summitslist.csv` | 60s polling |

POTA program→flag mapping fetched live from `api.pota.app/programs` (cached for app lifetime).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical breakdown including:

- File map with every module's purpose
- Data flow diagrams for both sections
- Tauri IPC commands and events
- Caching strategy
- Known issues and limitations

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 |
| Backend | Rust, tokio, rumqttc, reqwest, rusqlite |
| Frontend | React 18, TypeScript, Vite |
| Map | Leaflet, react-leaflet, leaflet.geodesic |
| Database | SQLite (bundled via rusqlite) |

## License

MIT
