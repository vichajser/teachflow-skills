import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');

/** 无依据的断言——_SPEC.md 中没有任何东西支撑这些说法 */
const UNSUPPORTED_CLAIMS = [
  /third[- ]party security audit/i,
  /independently audited/i,
  /penetration[- ]tested/i,
  /certified secure/i,
  /제3자 보안 감사/,
  /보안 인증을 받았/,
];

describe('/security wording discipline', () => {
  it('states only what _SPEC.md actually constrains', () => {
    for (const page of ['en/security/index.html', 'ko/security/index.html']) {
      const html = read(page);
      for (const claim of UNSUPPORTED_CLAIMS) {
        expect(html, `${page} makes an unsupported claim: ${claim}`).not.toMatch(claim);
      }
    }
  });

  it('names all eight Agensi scans on the English page', () => {
    const html = read('en/security/index.html');
    for (const scan of [
      'Prompt injection',
      'Data exfiltration',
      'Secret detection',
      'Dangerous commands',
      'Obfuscation',
      'External fetch',
      'Credential access',
      'Privilege escalation',
    ]) {
      expect(html, `missing scan row: ${scan}`).toContain(scan);
    }
  });
});
