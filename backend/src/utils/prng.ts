/**
 * Deterministic pseudo-random utilities.
 *
 * Business outcomes must be reproducible from a seed, so no call site uses
 * Math.random().  The same seed and entity id always produce the same draw.
 */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRandom(seed: number, key: string): () => number {
  return mulberry32((seed ^ hashString(key)) >>> 0);
}

export function pickWeighted<T>(random: () => number, entries: Array<[T, number]>): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let threshold = random() * total;
  for (const [value, weight] of entries) {
    threshold -= weight;
    if (threshold <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
