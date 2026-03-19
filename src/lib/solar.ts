import type { LatLngExpression } from "leaflet";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * Compute the night-side polygon for the solar terminator.
 * Extends to ±540 longitude so it covers Leaflet's wrapped world copies.
 */
export function computeGrayline(date: Date = new Date()): LatLngExpression[] {
  const dayOfYear = getDayOfYear(date);
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;

  // Solar declination in radians
  const declination = -23.44 * DEG * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));

  // Subsolar point longitude
  const subSolarLon = (12 - utcHours) * 15;

  // The terminator curve: for each longitude, the latitude where the sun
  // is exactly on the horizon.
  function terminatorLat(lon: number): number {
    const hourAngle = (lon - subSolarLon) * DEG;
    return Math.atan(-Math.cos(hourAngle) / Math.tan(declination)) * RAD;
  }

  // Night pole: opposite of sun's hemisphere
  const nightPole = declination > 0 ? -90 : 90;

  // Build the polygon covering ±540° longitude (3 full world widths)
  // so that Leaflet's world copies are also covered.
  const lonMin = -1800;
  const lonMax = 1800;

  const polygon: LatLngExpression[] = [];

  // Walk the terminator from lonMin to lonMax
  for (let lon = lonMin; lon <= lonMax; lon += 1) {
    polygon.push([terminatorLat(lon), lon]);
  }

  // Close through the night pole
  polygon.push([nightPole, lonMax]);
  polygon.push([nightPole, lonMin]);

  return polygon;
}

function getDayOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
