const EARTH_RADIUS = 6378137;

/** Spherical Web Mercator (EPSG:3857) metres to WGS84 degrees. */
export function webMercatorToWgs84(x: number, y: number): { lon: number; lat: number } {
  const lon = (x / EARTH_RADIUS) * (180 / Math.PI);
  const lat = Math.atan(Math.sinh(y / EARTH_RADIUS)) * (180 / Math.PI);
  return { lon, lat };
}

/**
 * NAD83 / UTM zone 17N (GRS80) metres to WGS84 degrees.
 * NAD83 and WGS84 differ by about a metre in southern Ontario. This conversion
 * uses the GRS80 ellipsoid published on the feature service and does not apply
 * a NAD83-to-WGS84 datum grid.
 */
export function utm17nToWgs84(easting: number, northing: number): { lon: number; lat: number } {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const x = easting - 500000;
  const y = northing;
  const lon0 = ((17 - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const n1 = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const t1 = Math.tan(phi1) ** 2;
  const c1 = ep2 * cosPhi * cosPhi;
  const r1 = (a * (1 - e2)) / (1 - e2 * sinPhi * sinPhi) ** 1.5;
  const d = x / (n1 * k0);
  const lat =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      (d * d / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720);
  const lon =
    lon0 +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120) /
      cosPhi;
  return { lon: (lon * 180) / Math.PI, lat: (lat * 180) / Math.PI };
}
