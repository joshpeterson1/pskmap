import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Spot, SpotQuery } from "../lib/types";

export function useSpots() {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchSpots = useCallback(async (query: SpotQuery) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Spot[]>("fetch_spots", { query });
      console.log(`[PSKmap] Received ${result.length} spots`, result.slice(0, 3));
      setSpots(result);
    } catch (e) {
      console.error("[PSKmap] invoke error:", e);
      setError(String(e));
      setSpots([]);
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, []);

  return { spots, loading, error, hasFetched, fetchSpots };
}
