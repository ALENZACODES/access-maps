const EXTENT = 4096;

export interface MvtFeature {
  kind: "point" | "line";
  /** Pixel coordinates inside the tile. A point has one pair. A line has at least two. */
  pixels: [number, number][];
  props: Record<string, string>;
}

export function encodeMvt(features: MvtFeature[], layerName = "access"): Buffer {
  if (features.length === 0) throw new Error("refusing to encode an empty tile");
  const keys: string[] = [];
  const keyIndex = new Map<string, number>();
  const values: string[] = [];
  const valueIndex = new Map<string, number>();
  const featureBodies: number[][] = [];
  for (const feature of features) {
    const tags: number[] = [];
    for (const [key, value] of Object.entries(feature.props)) {
      if (value === "") continue;
      let ki = keyIndex.get(key);
      if (ki === undefined) {
        ki = keys.length;
        keys.push(key);
        keyIndex.set(key, ki);
      }
      let vi = valueIndex.get(value);
      if (vi === undefined) {
        vi = values.length;
        values.push(value);
        valueIndex.set(value, vi);
      }
      tags.push(ki, vi);
    }
    const geometry = encodeGeometry(feature);
    const body: number[] = [];
    if (tags.length > 0) body.push(...packed(2, tags));
    body.push(...fieldVarint(3, feature.kind === "point" ? 1 : 2));
    body.push(...packed(4, geometry));
    featureBodies.push(body);
  }
  const layer: number[] = [];
  layer.push(...fieldString(1, layerName));
  for (const body of featureBodies) layer.push(...fieldMessage(2, body));
  for (const key of keys) layer.push(...fieldString(3, key));
  for (const value of values) layer.push(...fieldMessage(4, fieldString(1, value)));
  layer.push(...fieldVarint(5, EXTENT));
  layer.push(...fieldVarint(15, 2));
  return Buffer.from(fieldMessage(3, layer));
}

function encodeGeometry(feature: MvtFeature): number[] {
  const pixels = feature.pixels.map(([x, y]) => [clamp(Math.round(x)), clamp(Math.round(y))] as [number, number]);
  if (feature.kind === "point") {
    const [x, y] = pixels[0] ?? [0, 0];
    return [command(1, 1), zigzag(x), zigzag(y)];
  }
  if (pixels.length < 2) throw new Error("a line needs two points");
  const out: number[] = [command(1, 1)];
  const first = pixels[0] as [number, number];
  out.push(zigzag(first[0]), zigzag(first[1]));
  out.push(command(2, pixels.length - 1));
  let cx = first[0];
  let cy = first[1];
  for (let i = 1; i < pixels.length; i += 1) {
    const point = pixels[i] as [number, number];
    out.push(zigzag(point[0] - cx), zigzag(point[1] - cy));
    cx = point[0];
    cy = point[1];
  }
  return out;
}

function clamp(value: number): number {
  if (value < 0) return 0;
  if (value > EXTENT) return EXTENT;
  return value;
}

function command(id: number, count: number): number {
  return (id & 7) | (count << 3);
}

function zigzag(value: number): number {
  return value >= 0 ? value * 2 : -value * 2 - 1;
}

function fieldVarint(field: number, value: number): number[] {
  return [...varint((field << 3) | 0), ...varint(value)];
}

function fieldString(field: number, text: string): number[] {
  const bytes = [...Buffer.from(text, "utf8")];
  return [...varint((field << 3) | 2), ...varint(bytes.length), ...bytes];
}

function fieldMessage(field: number, body: number[]): number[] {
  return [...varint((field << 3) | 2), ...varint(body.length), ...body];
}

function packed(field: number, values: number[]): number[] {
  const body = values.flatMap((value) => varint(value));
  return [...varint((field << 3) | 2), ...varint(body.length), ...body];
}

function varint(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`varint out of range: ${value}`);
  const out: number[] = [];
  let n = value;
  while (n > 127) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}
