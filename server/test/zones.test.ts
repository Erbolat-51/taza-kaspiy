import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  distanceToPolygon,
  findZone,
  haversine,
  pointInPolygon,
  type PolygonGeometry,
} from '../src/geo/geo.js';

// Квадрат ~1.1 × 0.8 км вокруг 43.65, 51.15
const square: PolygonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [51.145, 43.645],
      [51.155, 43.645],
      [51.155, 43.655],
      [51.145, 43.655],
      [51.145, 43.645],
    ],
  ],
};

describe('geo', () => {
  it('haversine: 1° широты ≈ 111 км', () => {
    expect(haversine(43, 51, 44, 51)).toBeGreaterThan(111_000);
    expect(haversine(43, 51, 44, 51)).toBeLessThan(111_300);
  });

  it('pointInPolygon', () => {
    expect(pointInPolygon(43.65, 51.15, square)).toBe(true);
    expect(pointInPolygon(43.66, 51.15, square)).toBe(false);
  });

  it('distanceToPolygon: ~1.1 км к северу от края', () => {
    const d = distanceToPolygon(43.665, 51.15, square);
    expect(d).toBeGreaterThan(1050);
    expect(d).toBeLessThan(1170);
  });
});

describe('findZone', () => {
  const zones = [
    { id: 1, polygon: square },
    {
      id: 2,
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [51.2, 43.6],
            [51.21, 43.6],
            [51.21, 43.61],
            [51.2, 43.61],
            [51.2, 43.6],
          ],
        ],
      } as PolygonGeometry,
    },
  ];

  it('попадание в полигон', () => {
    expect(findZone(43.605, 51.205, zones)?.id).toBe(2);
  });
  it('ближайшая зона в радиусе 3 км', () => {
    expect(findZone(43.665, 51.15, zones)?.id).toBe(1);
  });
  it('дальше 3 км — null', () => {
    expect(findZone(43.8, 51.15, zones)).toBeNull();
  });

  it('реальные зоны из seed: центр Актау на берегу попадает в городскую зону', () => {
    const fc = JSON.parse(
      readFileSync(new URL('../prisma/seed/zones.geojson', import.meta.url), 'utf8'),
    ) as { features: { properties: { slug: string }; geometry: PolygonGeometry }[] };
    const seedZones = fc.features.map((f, i) => ({
      id: i,
      slug: f.properties.slug,
      polygon: f.geometry,
    }));
    // точка на полосе 6–9 мкр
    expect(findZone(43.662, 51.137, seedZones)?.slug).toBe('mkr-6-9');
    // в море в 1 км от берега — ближайшая зона
    expect(findZone(43.662, 51.125, seedZones)?.slug).toBe('mkr-6-9');
    // Бекет-Ата/степь — вне зон
    expect(findZone(43.7, 51.4, seedZones)).toBeNull();
  });
});
