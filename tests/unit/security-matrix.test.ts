import { describe, it, expect } from 'vitest';
import { SECURITY_MATRIX, VERIFIABLE_FACTS } from '@/data/security-matrix';

const AGENSI_SCANS = [
  'Prompt injection',
  'Data exfiltration',
  'Secret detection',
  'Dangerous commands',
  'Obfuscation',
  'External fetch',
  'Credential access',
  'Privilege escalation',
];

describe('SECURITY_MATRIX', () => {
  it("mirrors Agensi's eight scans, in their order and wording", () => {
    expect(SECURITY_MATRIX.map((row) => row.scan)).toEqual(AGENSI_SCANS);
  });

  it('answers every scan in both locales', () => {
    for (const row of SECURITY_MATRIX) {
      for (const locale of ['en', 'ko'] as const) {
        expect(row.practice[locale].length, `${row.scan} practice.${locale}`)
          .toBeGreaterThan(0);
        expect(row.verify[locale].length, `${row.scan} verify.${locale}`)
          .toBeGreaterThan(0);
      }
    }
  });
});

describe('VERIFIABLE_FACTS', () => {
  it('offers the two facts a reader can check for themselves', () => {
    expect(VERIFIABLE_FACTS.map((f) => f.id)).toEqual([
      'no-executable-code',
      'verify-script',
    ]);
  });
});
