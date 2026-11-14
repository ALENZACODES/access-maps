/** FNV-1a, 32-bit. Used only to turn the seed string into PRNG state. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32. Deterministic, not for security. */
export function createRandom(seed: string): () => number {
  let state = hashString(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Reservoir sampling (Algorithm R). Feeding the same items in the same order
 * with the same seed returns the same sample, so a reviewer can re-run it.
 */
export class Reservoir<T> {
  private readonly items: T[] = [];
  private seen = 0;
  private readonly random: () => number;

  constructor(
    private readonly size: number,
    seed: string,
  ) {
    this.random = createRandom(seed);
  }

  offer(item: T): void {
    this.seen += 1;
    if (this.items.length < this.size) {
      this.items.push(item);
      return;
    }
    const slot = Math.floor(this.random() * this.seen);
    if (slot < this.size) this.items[slot] = item;
  }

  values(): T[] {
    return [...this.items];
  }

  get count(): number {
    return this.seen;
  }
}
