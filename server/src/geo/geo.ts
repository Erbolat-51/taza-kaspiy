/** Географические утилиты. Координаты в GeoJSON — [lng, lat]. */

export type LngLat = [number, number];

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: LngLat[][];
}

const EARTH_R = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Расстояние между точками по формуле гаверсинуса, в метрах. */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

/** Ray casting: лежит ли точка внутри кольца. */
function inRing(lat: number, lng: number, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lat: number, lng: number, poly: PolygonGeometry): boolean {
  const [outer, ...holes] = poly.coordinates;
  if (!outer || !inRing(lat, lng, outer)) return false;
  return !holes.some((h) => inRing(lat, lng, h));
}

/**
 * Минимальное расстояние от точки до границы полигона, в метрах.
 * Локальная равнопромежуточная проекция — на масштабе нескольких км погрешность < 1%.
 */
export function distanceToPolygon(lat: number, lng: number, poly: PolygonGeometry): number {
  if (pointInPolygon(lat, lng, poly)) return 0;
  const kx = EARTH_R * toRad(1) * Math.cos(toRad(lat));
  const ky = EARTH_R * toRad(1);
  let best = Infinity;
  for (const ring of poly.coordinates) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = ring[i]!;
      const [bx, by] = ring[i + 1]!;
      const x1 = (ax - lng) * kx;
      const y1 = (ay - lat) * ky;
      const dx = (bx - ax) * kx;
      const dy = (by - ay) * ky;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / len2));
      best = Math.min(best, Math.hypot(x1 + t * dx, y1 + t * dy));
    }
  }
  return best;
}

export interface ZoneShape {
  id: number;
  polygon: PolygonGeometry;
}

export const ZONE_SNAP_RADIUS_M = 3000;

/** Зона точки: сначала попадание в полигон, иначе ближайшая в радиусе 3 км, иначе null. */
export function findZone<T extends ZoneShape>(lat: number, lng: number, zones: T[]): T | null {
  const hit = zones.find((z) => pointInPolygon(lat, lng, z.polygon));
  if (hit) return hit;
  let best: T | null = null;
  let bestDist = ZONE_SNAP_RADIUS_M;
  for (const z of zones) {
    const d = distanceToPolygon(lat, lng, z.polygon);
    if (d <= bestDist) {
      best = z;
      bestDist = d;
    }
  }
  return best;
}
