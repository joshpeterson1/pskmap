import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BANDS } from "../lib/bands";
import type { Spot } from "../lib/types";

function humanizeError(raw: string): string {
  if (raw.includes("timed out") || raw.includes("timeout"))
    return "Request timed out — PSKreporter may be slow. Try again or narrow your filters.";
  if (raw.includes("dns") || raw.includes("resolve") || raw.includes("No such host"))
    return "Cannot reach PSKreporter — check your internet connection.";
  if (raw.includes("status 5"))
    return "PSKreporter is having server issues. Try again in a minute.";
  return raw;
}

/** Filter spots by band, mode, and time range client-side. */
function filterSpots(
  spots: Spot[],
  band: string | null,
  mode: string | null,
  timeRangeSeconds: number
): Spot[] {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - timeRangeSeconds;

  return spots.filter((s) => {
    if (s.timestamp != null && s.timestamp < cutoff) return false;

    if (band) {
      const info = BANDS[band];
      if (info && (s.frequency < info.freqLow || s.frequency > info.freqHigh)) return false;
    }

    if (mode && s.mode.toLowerCase() !== mode.toLowerCase()) return false;

    return true;
  });
}

export function useSpots() {
  const [rawSpots, setRawSpots] = useState<Spot[]>([]);
  const [filters, setFilters] = useState<{ band: string | null; mode: string | null; timeRangeSeconds: number }>({
    band: null,
    mode: null,
    timeRangeSeconds: 3600,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [mqttStatus, setMqttStatus] = useState<string>("connecting");
  const seenKeys = useRef(new Set<string>());
  const activeCallsign = useRef<string | null>(null);

  // Set up event listeners once
  useEffect(() => {
    const unlisteners = [
      listen<Spot>("spot", (event) => {
        const s = event.payload;
        const key = `${s.receiverCallsign}|${s.frequency}|${s.timestamp}`;
        if (seenKeys.current.has(key)) return;
        seenKeys.current.add(key);
        setRawSpots((prev) => [...prev, s]);
      }),

      listen<Spot[]>("spots-backfill", (event) => {
        const spots = event.payload;
        seenKeys.current.clear();
        for (const s of spots) {
          const key = `${s.receiverCallsign}|${s.frequency}|${s.timestamp}`;
          seenKeys.current.add(key);
        }
        setRawSpots(spots);
        setLoading(false);
        setHasFetched(true);
        console.log(`[PSKmap] Backfill: ${spots.length} spots`);
      }),

      listen<string>("backfill-error", (event) => {
        setError(humanizeError(event.payload));
        setLoading(false);
        setHasFetched(true);
      }),

      listen<string>("mqtt-status", (event) => {
        setMqttStatus(event.payload);
        console.log(`[PSKmap] MQTT status: ${event.payload}`);
      }),
    ];

    return () => {
      unlisteners.forEach((p) => p.then((f) => f()));
    };
  }, []);

  // Filtered view
  const spots = useMemo(
    () => filterSpots(rawSpots, filters.band, filters.mode, filters.timeRangeSeconds),
    [rawSpots, filters]
  );

  const fetchSpots = useCallback(
    async (query: { callsign: string; band: string | null; mode: string | null; timeRangeSeconds: number }) => {
      const callsign = query.callsign;
      const band = query.band && query.band !== "All" ? query.band : null;
      const mode = query.mode && query.mode !== "All" ? query.mode : null;
      const timeRangeSeconds = Math.abs(query.timeRangeSeconds);

      // Always update filters
      setFilters({ band, mode, timeRangeSeconds });

      // If same callsign, just a filter change — no need to resubscribe
      if (callsign === activeCallsign.current) return;

      // New callsign — subscribe + backfill
      activeCallsign.current = callsign;
      setLoading(true);
      setError(null);
      setRawSpots([]);
      seenKeys.current.clear();
      setHasFetched(false);

      try {
        await invoke("subscribe_callsign", { callsign });
      } catch (e) {
        setError(humanizeError(String(e)));
        setLoading(false);
      }
    },
    []
  );

  return { spots, loading, error, hasFetched, mqttStatus, fetchSpots };
}
