/**
 * Fixed-seed reproducibility: generating the same profile twice with the same
 * seed must produce byte-identical exports.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const DATA_ENGINE = path.resolve(process.cwd(), '..', 'data-engine');
const EXPORTS = path.join(DATA_ENGINE, 'exports');
const MANIFEST = path.join(EXPORTS, 'manifest.json');

function generate(seed: number) {
  execFileSync('python', ['main.py', '--profile', 'small', '--seed', String(seed)], {
    cwd: DATA_ENGINE,
    encoding: 'utf8',
  });
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as {
    datasetHash: string;
    seed: number;
    counts: Record<string, number>;
  };
}

describe('fixed-seed reproducibility', () => {
  it('produces the same dataset hash for the default seed', () => {
    const first = generate(20261022);
    const second = generate(20261022);
    expect(second.datasetHash).toBe(first.datasetHash);
    expect(first.counts.customers).toBe(500);
    expect(first.counts.orders).toBe(2000);
    expect(first.counts.engagementEvents).toBe(10000);
  });

  it('produces a different dataset for a different seed', () => {
    const a = generate(20261022);
    const b = generate(777001);
    expect(b.datasetHash).not.toBe(a.datasetHash);
  });

  it('keeps the reported counts proportional to the requested profile', () => {
    const manifest = generate(20261022);
    expect(manifest.counts.orders).toBe(manifest.counts.customers * 4);
    expect(manifest.counts.engagementEvents).toBe(manifest.counts.customers * 20);
  });
});
