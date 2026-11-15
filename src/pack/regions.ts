export type BBox = [number, number, number, number];

export interface PackRegion {
  id: string;
  label: { en: string; fr: string };
  bbox: BBox;
  cells: string[];
}

// Geographic discovery windows, not municipal boundaries. A cell is included
// if its half-degree square intersects the window.
export const REGION_WINDOWS: ReadonlyArray<Omit<PackRegion, "cells">> = [
  { id: "toronto", label: { en: "Toronto", fr: "Toronto" }, bbox: [-79.64, 43.58, -79.11, 43.86] },
  { id: "ottawa", label: { en: "Ottawa", fr: "Ottawa" }, bbox: [-76.15, 44.95, -75.25, 45.55] },
  { id: "hamilton", label: { en: "Hamilton", fr: "Hamilton" }, bbox: [-80.05, 43.10, -79.65, 43.43] },
  { id: "peel", label: { en: "Mississauga / Brampton (Peel)", fr: "Mississauga / Brampton (Peel)" }, bbox: [-80.05, 43.47, -79.52, 43.95] },
  { id: "london", label: { en: "London", fr: "London" }, bbox: [-81.43, 42.82, -80.90, 43.12] },
  { id: "kingston", label: { en: "Kingston", fr: "Kingston" }, bbox: [-76.70, 44.15, -76.35, 44.35] },
  { id: "sudbury", label: { en: "Sudbury", fr: "Sudbury" }, bbox: [-81.15, 46.35, -80.75, 46.65] },
  { id: "waterloo", label: { en: "Waterloo Region", fr: "Région de Waterloo" }, bbox: [-80.72, 43.25, -80.25, 43.65] },
  { id: "windsor", label: { en: "Windsor", fr: "Windsor" }, bbox: [-83.15, 42.20, -82.85, 42.40] },
  { id: "niagara", label: { en: "Niagara", fr: "Niagara" }, bbox: [-79.65, 42.80, -79.00, 43.35] },
];

export function cellBBox(id: string): BBox {
  const match = /^([ns])(\d{2,3}\.\d)_([ew])(\d{3}\.\d)$/.exec(id);
  if (!match) throw new Error(`Invalid cell: ${id}`);
  const south = Number(match[2]) * (match[1] === "s" ? -1 : 1);
  const west = Number(match[4]) * (match[3] === "w" ? -1 : 1);
  if (south * 2 !== Math.floor(south * 2) || west * 2 !== Math.floor(west * 2)) {
    throw new Error(`Misaligned cell: ${id}`);
  }
  return [west, south, west + 0.5, south + 0.5];
}

export function overlaps(a: BBox, b: BBox): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

export function makeRegions(cells: readonly string[]): PackRegion[] {
  const unique = [...new Set(cells)].sort();
  const boxes = unique.map((cell) => ({ cell, bbox: cellBBox(cell) }));
  const regions = REGION_WINDOWS.map((region) => ({
    ...region,
    cells: boxes.filter((entry) => overlaps(entry.bbox, region.bbox)).map((entry) => entry.cell),
  }));
  const west = Math.min(...boxes.map((entry) => entry.bbox[0]));
  const south = Math.min(...boxes.map((entry) => entry.bbox[1]));
  const east = Math.max(...boxes.map((entry) => entry.bbox[2]));
  const north = Math.max(...boxes.map((entry) => entry.bbox[3]));
  regions.push({
    id: "ontario-all",
    label: { en: "All Ontario", fr: "Tout l’Ontario" },
    bbox: boxes.length ? [west, south, east, north] : [-95.2, 41.6, -74.3, 56.9],
    cells: unique,
  });
  return regions;
}
