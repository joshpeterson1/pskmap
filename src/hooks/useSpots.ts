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

/** Filter spots by bands, modes, and time range client-side. */
function filterSpots(
  spots: Spot[],
  bands: string[],
  modes: string[],
  timeRangeSeconds: number
): Spot[] {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - timeRangeSeconds;

  return spots.filter((s) => {
    if (s.timestamp != null && s.timestamp < cutoff) return false;

    if (bands.length > 0) {
      const match = bands.some((band) => {
        const info = BANDS[band];
        return info && s.frequency >= info.freqLow && s.frequency <= info.freqHigh;
      });
      if (!match) return false;
    }

    if (modes.length > 0) {
      if (!modes.some((m) => s.mode.toLowerCase() === m.toLowerCase())) return false;
    }

    return true;
  });
}

export function useSpots() {
  const [rawSpots, setRawSpots] = useState<Spot[]>([]);
  const [filters, setFilters] = useState<{ bands: string[]; modes: string[]; timeRangeSeconds: number }>({
    bands: [],
    modes: [],
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
    () => filterSpots(rawSpots, filters.bands, filters.modes, filters.timeRangeSeconds),
    [rawSpots, filters]
  );

  const fetchSpots = useCallback(
    async (query: { callsign: string; bands: string[]; modes: string[]; timeRangeSeconds: number }) => {
      const callsign = query.callsign;
      const bands = query.bands;
      const modes = query.modes;
      const timeRangeSeconds = Math.abs(query.timeRangeSeconds);

      // Always update filters
      setFilters({ bands, modes, timeRangeSeconds });

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
