# PSKmap

A desktop app that shows **who hears your signal** on the air. Enter your callsign and watch reception reports appear on a world map in real-time via [PSKreporter](https://pskreporter.info) MQTT streaming.

Built with Tauri v2 (Rust + React).

## Features

- **Real-time spot streaming** — MQTT push from PSKreporter, no polling
- **Dark world map** — CartoDB tiles with band-colored markers, geodesic signal arcs, and marker clustering
- **Grayline overlay** — Solar terminator updates every 60 seconds
- **Sortable spot table** — Time, callsigns, frequency/band, mode, SNR, distance
- **Split view** — Map only, table only, or both side by side
- **Filters** — Band (160m–2m), mode (FT8, CW, SSB, etc.), time range (15 min–24 hrs)
- **Stats panel** — Total spots, unique receivers, SNR best/worst/avg, farthest contact, top band
- **Favorites** — Save callsigns for quick switching
- **Keyboard shortcuts** — `/` focus search, `1`/`2`/`3` switch views, `r` re-fetch, `Esc` clear
- **Cross-highlighting** — Click a table row to highlight its marker on the map, and vice versa
- **SNR-sized markers** — Stronger signals render larger; older spots fade with time-decay opacity

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

1. Enter your callsign (e.g. `W1AW`) and click **Track**
2. The app subscribes to PSKreporter's MQTT stream for your callsign
3. Spots appear on the map and table as they arrive in real-time
4. Use band, mode, and time range filters to narrow results
5. Star a callsign to save it to favorites for quick access

## How It Works

PSKmap connects to two PSKreporter data sources:

| Source | Purpose | Reliability |
|--------|---------|-------------|
| **MQTT** (`mqtt.pskreporter.info:1883`) | Real-time spot stream | Primary, reliable |
| **HTTPS** (`pskreporter.info/cgi-bin/pskquery5.pl`) | 24h historical backfill | Best-effort, unreliable |

MQTT is the authoritative data source. The HTTPS API is used only for initial backfill when you first subscribe to a callsign — see [Architecture](ARCHITECTURE.md) for details on known limitations with the HTTP endpoint.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical breakdown including:

- File map with every module's purpose
- Data flow diagrams (subscribe → MQTT/HTTP → dedup → filter → render)
- Tauri IPC commands and events
- Known issues and limitations

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 |
| Backend | Rust, tokio, rumqttc, reqwest |
| Frontend | React 18, TypeScript, Vite |
| Map | Leaflet, react-leaflet, leaflet.geodesic |

## License

MIT
