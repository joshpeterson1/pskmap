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
