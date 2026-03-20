import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ExternalSpot, SpotSource } from "../lib/external-types";

const REFRESH_INTERVAL = 60_000;

export function useExternalSpots(enabledSources: SpotSource[]) {
  const [spots, setSpots] = useState<ExternalSpot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const sourcesRef = useRef(enabledSources);
  sourcesRef.current = enabledSources;

  const refresh = useCallback(async () => {
    const sources = sourcesRef.current;
    if (sources.length === 0) {
      setSpots([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await invoke<ExternalSpot[]>("fetch_external_spots", {
        sources,
      });
      setSpots(result);
      setLastRefresh(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when sources change
  useEffect(() => {
    refresh();
  }, [enabledSources.join(","), refresh]);

  // Auto-refresh
  useEffect(() => {
    if (enabledSources.length === 0) return;
    const id = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [enabledSources.join(","), refresh]);

  return { spots, loading, error, lastRefresh, refresh };
}
