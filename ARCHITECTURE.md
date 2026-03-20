# PSKmap Architecture

> Tauri v2 desktop app that visualizes who hears YOUR ham radio signal via PSKreporter.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 (Rust backend + webview frontend) |
| Backend | Rust, tokio async runtime |
| Frontend | React 18, TypeScript, Vite |
| Map | Leaflet + react-leaflet (CartoDB Dark Matter tiles) |
| Real-time data | MQTT via `rumqttc` (plaintext, port 1883) |
| Historical data | HTTPS via `reqwest` (PSKreporter XML API) |

---

## Data Sources

### MQTT — Real-time Spot Stream (PRIMARY)

| Detail | Value |
|--------|-------|
| Broker | `mqtt.pskreporter.info:1883` |
| Protocol | Plaintext TCP (no TLS) |
| Topic | `pskr/filter/v2/+/+/{CALLSIGN}/#` |
| QoS | AtMostOnce |
| Payload | JSON (`MqttSpotRaw` — abbreviated fields: `sq`, `f`, `md`, `rp`, `t`, `sc`, `sl`, `rc`, `rl`, `sa`, `ra`, `b`) |
| Client ID | `pskmap-{8-char-hex}` |

MQTT is the **primary and reliable** data source. Spots arrive in real-time as they are decoded worldwide.

### HTTPS API — Historical Backfill (UNRELIABLE)

| Detail | Value |
|--------|-------|
| Endpoint | `https://pskreporter.info/cgi-bin/pskquery5.pl` |
| Parameters | `senderCallsign`, `noactive=1`, `nolocator=1`, `flowStartSeconds=-86400` |
| Response | XML (`receptionReport` elements) |
| Timeout | 30 seconds |
| Contact | `appcontact=josh@somber.dev` |

> **⚠️ KNOWN ISSUE: HTTPS API returns unreliable/incomplete results.**
>
> The PSKreporter HTTPS API (`pskquery5.pl`) does not consistently return complete
> historical data. Backfill results are often missing spots or returning partial
> datasets. This has been confirmed through testing. The API also aggressively
> rate-limits requests (detected via JSON error response instead of XML).
>
> **Impact:** Users may see few or no spots on initial subscribe until MQTT
> stream populates data in real-time. The app cannot be relied upon for
> historical analysis via this endpoint.
>
> **Current mitigation:** The app treats backfill as best-effort. MQTT streaming
> is the authoritative data source. Backfill errors are surfaced to the user
> but do not block the MQTT stream.
>
> **Possible future approaches:**
> - Cache MQTT spots locally (SQLite) to build our own history
> - Investigate alternative PSKreporter API endpoints or parameters
> - Implement retry with exponential backoff for rate-limited requests

---

## File Map

### Rust Backend (`src-tauri/src/`)

| File | Purpose |
|------|---------|
| `lib.rs` | App bootstrap — registers plugins, manages MQTT state, exposes Tauri commands |
| `commands.rs` | Tauri command handlers: `subscribe_callsign` (MQTT + HTTP backfill), `unsubscribe` |
| `mqtt.rs` | MQTT client lifecycle — connect, subscribe, event loop, reconnect, emit `spot` events |
| `pskreporter.rs` | HTTPS backfill — fetches XML from PSKreporter API, parses into `Vec<Spot>`, handles rate limits |
| `models.rs` | Data models (`Spot`, `MqttSpotRaw`, `SpotQuery`), Maidenhead grid→lat/lon, haversine distance |

### React Frontend (`src/`)

| File | Purpose |
|------|---------|
| `App.tsx` | Root layout — orchestrates ControlPanel, StatsPanel, MapView, SpotTable; status bars (offline, MQTT, errors) |
| `App.css` | All application styles (dark theme, layout, components) |

### Components (`src/components/`)

| File | Purpose |
|------|---------|
| `ControlPanel.tsx` | Callsign input + validation, band/mode/time filters, favorites (localStorage), view toggle, keyboard shortcuts (`/`, `Esc`, `1`/`2`/`3`, `r`) |
| `MapView.tsx` | Leaflet map — receiver markers (SNR-sized, band-colored, clustered), geodesic arcs, sender marker, grayline overlay, band legend |
| `SpotTable.tsx` | Sortable data table — columns: time, TX, RX, freq/band, mode, SNR, distance; syncs selection with map |
| `StatsPanel.tsx` | Summary stats bar — total spots, unique receivers, top band, SNR best/worst/avg, distance farthest/avg |

### Hooks (`src/hooks/`)

| File | Purpose |
|------|---------|
| `useSpots.ts` | Core state manager — holds `rawSpots`, listens for Tauri events (`spot`, `spots-backfill`, `backfill-error`, `mqtt-status`), client-side filtering, deduplication (`receiver\|freq\|timestamp`), error humanization |
| `useOnlineStatus.ts` | Tracks `navigator.onLine` for offline detection |
| `useGrayline.ts` | Computes solar terminator polygon, updates every 60s |

### Libraries (`src/lib/`)

| File | Purpose |
|------|---------|
| `types.ts` | Shared TypeScript interfaces: `Spot`, `SpotQuery`, `ViewMode`, `SortField`, `SortDir` |
| `bands.ts` | Band definitions (160m–2m) with frequency ranges and colors; `freqToBand()`, `freqToBandColor()`, `formatFreq()` |
| `modes.ts` | Mode list (FT8, FT4, CW, SSB, JS8, WSPR, RTTY, PSK31, JT65, JT9, MSK144, Q65, VARAC) |
| `solar.ts` | Solar declination + terminator latitude computation for grayline polygon |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│  User enters callsign in ControlPanel                   │
│  → Tauri invoke: subscribe_callsign(callsign)           │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│  MQTT Subscribe      │   │  HTTPS Backfill (⚠️)         │
│  Topic: pskr/filter/ │   │  pskquery5.pl?sender=...     │
│  v2/+/+/CALL/#       │   │  Parse XML → Vec<Spot>       │
│                      │   │  (UNRELIABLE — see above)    │
│  Event loop:         │   │                              │
│  JSON → MqttSpotRaw  │   │  Emit: "spots-backfill"     │
│  → grid_to_latlon    │   │    or: "backfill-error"      │
│  → haversine_km      │   │                              │
│  → Spot              │   └──────────────────────────────┘
│                      │
│  Emit: "spot"        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│  useSpots hook (frontend)                                │
│  • Deduplicates (receiver|freq|timestamp)                │
│  • Filters by band, mode, time range                     │
│  • Exposes: spots[], loading, error, mqttStatus          │
└──────────┬──────────────────────┬───────────────────────┘
           │                      │
           ▼                      ▼
┌──────────────────┐   ┌──────────────────┐
│  MapView         │   │  SpotTable       │
│  • Markers       │   │  • Sortable rows │
│  • Arcs          │   │  • Band colors   │
│  • Grayline      │   │  • Selection     │
│  • Clustering    │   │    sync ↔ map    │
└──────────────────┘   └──────────────────┘
```

## Tauri IPC

### Commands (Frontend → Backend)

| Command | Args | Effect |
|---------|------|--------|
| `subscribe_callsign` | `callsign: String` | Subscribe MQTT + trigger HTTP backfill |
| `unsubscribe` | — | Disconnect MQTT stream |

### Events (Backend → Frontend)

| Event | Payload | Source |
|-------|---------|--------|
| `spot` | Single `Spot` | MQTT event loop |
| `spots-backfill` | `Vec<Spot>` | HTTP fetch success |
| `backfill-error` | `String` | HTTP fetch failure/rate limit |
| `mqtt-status` | `"connected"` / `"disconnected"` | MQTT connection state |

## Local Storage

| Key | Content |
|-----|---------|
| `pskmap_prefs` | Last query: callsign, band, mode, timeRange |
| `pskmap_favorites` | Array of favorited callsigns |

---

## Known Issues & Limitations

1. **HTTPS backfill unreliable** — See detailed note above. Primary data comes from MQTT.
2. **No local spot cache** — Spots are in-memory only; closing the app loses all data.
3. **MQTT unencrypted** — Port 1883, no TLS. Callsign data sent in plaintext.
4. **No backfill retry** — Rate-limited requests show an error; user must manually re-subscribe.
5. **UTC only** — All timestamps displayed in UTC, no local timezone option.
6. **No offline tile cache** — Map tiles won't load without internet.
