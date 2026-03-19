import { useState, useEffect } from "react";
import type { LatLngExpression } from "leaflet";
import { computeGrayline } from "../lib/solar";

export function useGrayline(): LatLngExpression[] {
  const [polygon, setPolygon] = useState<LatLngExpression[]>(() =>
    computeGrayline()
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setPolygon(computeGrayline());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  return polygon;
}
