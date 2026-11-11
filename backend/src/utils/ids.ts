/**
 * Deterministic business identifiers.  These are the identifiers users see and
 * that appear in exports; internal auto-increment keys never leave the API.
 */

const pad = (value: number, width: number) => String(value).padStart(width, '0');

export const customerCode = (n: number) => `CUS-${pad(n, 6)}`;
export const orderCode = (n: number) => `ORD-2026-${pad(n, 6)}`;
export const segmentCode = (n: number) => `SEG-2026-${pad(n, 6)}`;
export const actionCode = (n: number) => `ACTN-2026-${pad(n, 6)}`;
export const recommendationCode = (n: number) => `REC-2026-${pad(n, 6)}`;
export const outcomeCode = (n: number) => `OUTC-${pad(n, 6)}`;
export const exceptionCode = (n: number) => `EXC-${pad(n, 6)}`;
export const consentCode = (n: number) => `CNS-${pad(n, 6)}`;
export const membershipCode = (segmentCodeValue: string, customerCodeValue: string) =>
  `MEM-${segmentCodeValue}-${customerCodeValue}`;
export const runCode = (prefix: string, at: Date) => {
  const stamp = at.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `${prefix}-${stamp}`;
};

/** Next numeric suffix for a code family, derived from existing rows. */
export function nextSequenceFromCodes(codes: string[], pattern: RegExp): number {
  let max = 0;
  for (const code of codes) {
    const match = pattern.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

export const CODE_PATTERNS = {
  recommendation: /^REC-2026-(\d{6})$/,
  outcome: /^OUTC-(\d{6})$/,
  exception: /^EXC-(\d{6})$/,
  consent: /^CNS-(\d{6})$/,
};
