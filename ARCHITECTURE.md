# PSKmap Architecture

> Tauri v2 desktop app with two sections: **My Signal** (PSKreporter spot tracker) and **Station Finder** (POTA/SOTA activator map).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 (Rust backend + webview frontend) |
| Backend | Rust, tokio async runtime |
| Frontend | React 18, TypeScript, Vite |
| Map | Leaflet + react-leaflet (CartoDB Dark Matter tiles) |
| Database | SQLite via rusqlite (bundled) |
| Real-time data | MQTT via `rumqttc` (plaintext, port 1883) |
| Historical data | HTTPS via `reqwest` (PSKreporter JSONP API) |
| External spots | POTA REST API, SOTA REST API + CSV |

---

## App Layout

```
┌──────┬──────────────────────────────────────┐
│      │  [Section-specific controls/filters]  │
│  S   │  [Status bars]                        │
│  I   │  [Stats]                              │
│  D   │                                       │
│  E   │  [Content area - map/table/split]     │
│  B   │                                       │
│  A   │                                       │
│  R   │                                       │
│      │                                       │
└──────┴──────────────────────────────────────┘
```

48px icon sidebar on the left. Both sections stay mounted (hidden via `display: none`) to preserve state when switching.

---

## Data Sources

### My Signal — PSKreporter

#### MQTT — Real-time Spot Stream (PRIMARY)

| Detail | Value |
|--------|-------|
| Broker | `mqtt.pskreporter.info:1883` |
| Protocol | Plaintext TCP (no TLS) |
| Topic | `pskr/filter/v2/+/+/{CALLSIGN}/#` |
| QoS | AtMostOnce |
| Payload | JSON (`MqttSpotRaw` — fields: `sq`, `f`, `md`, `rp`, `t`, `sc`, `sl`, `rc`, `rl`, `sa`, `ra`, `b`) |

#### HTTPS API — Historical Backfill (JSONP)

| Detail | Value |
|--------|-------|
| Endpoint | `https://pskreporter.info/cgi-bin/pskquery5.pl` |
| Parameters | `callback=doNothing`, `mc_version`, `pskvers`, `statistics=1`, `noactive=1`, `nolocator=1`, `senderCallsign` |
| Time param | `flowStartSeconds=-86400` (first fetch) or `lastseqno={N}` (incremental) |
| Response | JSONP wrapping JSON with `receptionReport[]` and `lastSequenceNumber` |
| Headers required | `referer: pskreporter.info/pskmap.html` + browser user-agent |

The JSONP endpoint with `callback=doNothing` and version params is required — the plain XML endpoint returns incomplete data.

#### SQLite Cache

| Detail | Value |
|--------|-------|
| Location | `{app_data_dir}/pskmap.db` |
| Tables | `spots` (UNIQUE on sender+receiver+freq+timestamp), `metadata` (key-value) |
| Retention | 14 days (pruned on startup) |
| Incremental | `lastSequenceNumber` stored per callsign in metadata table |

**Flow:**
1. First launch → `flowStartSeconds=-86400` → store spots + seq number
2. Subsequent launches → `lastseqno={stored}` → only new spots fetched
3. MQTT spots also persisted on arrival
4. Backfill emits ALL cached spots from DB (not just HTTP response)
5. On HTTP error, cached spots are served as fallback

### Station Finder — POTA

| Detail | Value |
|--------|-------|
| Endpoint | `https://api.pota.app/spot/activator` |
| Auth | None |
| Response | JSON array of active activators with lat/lon, frequency, mode, park reference |
| Refresh | 60s polling, 30s response cache |
| Programs | `https://api.pota.app/programs` — prefix→ISO mapping for flag icons (cached for app lifetime) |

### Station Finder — SOTA

| Detail | Value |
|--------|-------|
| Spots | `https://api2.sota.org.uk/api/spots/60/all` — last 60 spots (no coordinates) |
| Summits | `https://storage.sota.org.uk/summitslist.csv` — ~25 MB CSV with all summit coordinates |
| CSV cache | `{app_data_dir}/sota_summits.csv` — refreshed every 90 days on user prompt |
| Join | Spots matched to summits by `{associationCode}/{summitCode}` for lat/lon |

---

## File Map

### Rust Backend (`src-tauri/src/`)

| File | Purpose |
|------|---------|
| `lib.rs` | App bootstrap — inits SQLite, MQTT, registers all commands |
| `db.rs` | SQLite operations — schema, insert/query spots, metadata CRUD, pruning |
| `commands.rs` | `subscribe_callsign` (MQTT + incremental HTTP backfill + DB), `unsubscribe` |
| `mqtt.rs` | MQTT client — event loop, spot persistence to SQLite, reconnect |
| `pskreporter.rs` | HTTPS backfill — JSONP fetch with `lastseqno` support, returns `BackfillResult` |
| `models.rs` | Data models (`Spot`, `MqttSpotRaw`, `SpotQuery`), `grid_to_latlon`, `haversine_km` |
| `external_spots.rs` | Common `ExternalSpot` model for Station Finder sources |
| `station_finder.rs` | `fetch_external_spots` command, SOTA update check/download commands |
| `pota.rs` | POTA API — activator spots (30s cache), programs endpoint (app lifetime cache) |
| `sota.rs` | SOTA — CSV download/parse, summit HashMap, spot fetch + coordinate join |

### React Frontend (`src/`)

| File | Purpose |
|------|---------|
| `App.tsx` | Root — sidebar + section routing (both sections always mounted) |
| `App.css` | All styles (dark theme, sidebar, controls, filters, tables, maps) |

### Components (`src/components/`)

| File | Purpose |
|------|---------|
| `Sidebar.tsx` | 48px icon rail — My Signal / Station Finder navigation |
| `MySignalSection.tsx` | My Signal container — ControlPanel + status bars + StatsPanel + map/table |
| `ControlPanel.tsx` | Callsign input, dynamic band/mode filters, favorites, time range, view toggle |
| `MapView.tsx` | Leaflet map — receiver markers (SNR-sized, band-colored, clustered), geodesic arcs, grayline, pan-to-selection |
| `SpotTable.tsx` | Sortable table — time, ago, RX, TX, freq/band, mode, SNR, distance |
| `StatsPanel.tsx` | Summary stats bar |
| `StationFinderSection.tsx` | Station Finder container — controls + filters + SOTA update prompt + map/table |
| `StationFinderControls.tsx` | Source toggles, dynamic band/program/mode filters, refresh, view toggle |
| `StationFinderMap.tsx` | Leaflet map — source-colored markers, grayline, pan-to-selection, source legend |
| `StationFinderTable.tsx` | Sortable table — source, callsign, reference (with flag), freq, mode, spotter, ago |

### Hooks (`src/hooks/`)

| File | Purpose |
|------|---------|
| `useSpots.ts` | PSKreporter state — rawSpots + filtered spots, Tauri event listeners, dedup, MQTT status |
| `useExternalSpots.ts` | Station Finder state — fetch via Tauri command, 60s auto-refresh |
| `useOnlineStatus.ts` | Tracks `navigator.onLine` for offline detection |
| `useGrayline.ts` | Solar terminator polygon, updates every 60s |

### Libraries (`src/lib/`)

| File | Purpose |
|------|---------|
| `types.ts` | Shared TypeScript interfaces: `Spot`, `SpotQuery`, `ViewMode`, `SortField`, `SortDir` |
| `external-types.ts` | `ExternalSpot`, `SpotSource`, source colors and labels |
| `bands.ts` | Band definitions (160m–2m) with frequency ranges and colors |
| `modes.ts` | Mode list |
| `program-flags.ts` | POTA program prefix → flag URL via live `/programs` API |
| `solar.ts` | Solar declination + terminator computation |

---

## Data Flow — My Signal

```
App launch
  → SQLite: read last_seq_no for callsign
  → HTTP: lastseqno={N} (incremental) or flowStartSeconds=-86400 (first time)
  → SQLite: INSERT OR IGNORE new spots, update seq number
  → Emit ALL spots from DB as "spots-backfill"
  → On error: emit cached spots as fallback

MQTT (continuous)
  → JSON → MqttSpotRaw → Spot
  → SQLite: INSERT OR IGNORE
  → Emit "spot" to frontend

Frontend (useSpots)
  → Dedup via seenKeys Set
  → Filter by band, mode, time range
  → Render map + table
```

## Data Flow — Station Finder

```
User enables POTA/SOTA
  → invoke("fetch_external_spots", { sources: ["pota", "sota"] })
  → Backend fetches in parallel:
      POTA: api.pota.app/spot/activator → ExternalSpot[]
      SOTA: api2.sota.org.uk/spots + summitslist.csv join → ExternalSpot[]
  → Frontend filters by band/program/mode
  → Render map + table
  → Auto-refresh every 60s
```

## Tauri IPC

### Commands (Frontend → Backend)

| Command | Args | Effect |
|---------|------|--------|
| `subscribe_callsign` | `callsign` | MQTT subscribe + incremental HTTP backfill + DB cache |
| `unsubscribe` | — | Disconnect MQTT stream |
| `fetch_external_spots` | `sources: string[]` | Fetch POTA/SOTA spots |
| `get_pota_programs` | — | Returns prefix→ISO mapping for flags |
| `check_sota_update` | — | Returns true if summit CSV is missing or >90 days old |
| `download_sota_summits` | — | Downloads summitslist.csv (~25 MB) |

### Events (Backend → Frontend)

| Event | Payload | Source |
|-------|---------|--------|
| `spot` | Single `Spot` | MQTT event loop |
| `spots-backfill` | `Vec<Spot>` | DB query after HTTP backfill |
| `backfill-error` | `String` | HTTP failure (only if no cached data) |
| `mqtt-status` | `"connected"` / `"disconnected"` | MQTT connection state |

## Caching Strategy

| What | TTL | Mechanism | Location |
|------|-----|-----------|----------|
| PSK spots | 14 days | SQLite | `pskmap.db` |
| PSK lastSeqNo | Permanent | SQLite metadata | `pskmap.db` |
| HTTP client | App lifetime | `OnceLock<Client>` | In-memory |
| POTA programs | App lifetime | `OnceLock<Mutex<HashMap>>` | In-memory |
| POTA spots | 30 seconds | `OnceLock<Mutex<(Instant, Vec)>>` | In-memory |
| SOTA summits CSV | 90 days | File on disk | `sota_summits.csv` |
| SOTA summit HashMap | App lifetime | `OnceLock<Mutex<HashMap>>` | In-memory |
| User preferences | Permanent | localStorage | Browser |
| Favorites | Permanent | localStorage | Browser |

## Local Storage

| Key | Content |
|-----|---------|
| `pskmap_prefs` | Callsign, bands, modes, timeRange |
| `pskmap_favorites` | Array of favorited callsigns |

---

## Known Issues & Limitations

1. **MQTT unencrypted** — Port 1883, no TLS. Callsign data sent in plaintext.
2. **UTC only** — All timestamps displayed in UTC, no local timezone option.
3. **No offline tile cache** — Map tiles won't load without internet.
4. **RBN/DXCluster not yet implemented** — Shown as disabled in Station Finder.
5. **SOTA requires CSV download** — ~25 MB one-time download for summit coordinates.
6. **PSKreporter rate limiting** — Aggressive rate limits on HTTP API; SQLite cache mitigates repeat fetches.
