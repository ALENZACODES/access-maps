import type { RawFeature } from "./g4-helpers.js";

/**
 * Splits a multipart line into one feature per part, so no part of a published line is
 * dropped. A single-part or empty line is returned as it is. The part number is the
 * position of the part in the published geometry, counted from 1.
 */
export function lineParts(feature: RawFeature): { feature: RawFeature; part: number | null }[] {
  const paths = feature.geometry?.paths;
  if (!Array.isArray(paths) || paths.length <= 1) return [{ feature, part: null }];
  return paths.map((path, index) => ({
    feature: { ...feature, geometry: { ...feature.geometry, paths: [path] } },
    part: index + 1,
  }));
}

/** Record id for a line part: `<source>:<key>` for a single part, `<source>:<key>:<part>` otherwise. */
export function partId(sourceId: string, key: string, part: number | null): string {
  return part === null ? `${sourceId}:${key}` : `${sourceId}:${key}:${part}`;
}
