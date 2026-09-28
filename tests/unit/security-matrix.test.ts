import { describe, it, expect } from 'vitest';
import { SECURITY_MATRIX, VERIFIABLE_FACTS } from '@/data/security-matrix';

const RISK_ROWS = [
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
  it('keeps the eight risk rows, in their order and wording', () => {
    expect(SECURITY_MATRIX.map((row) => row.scan)).toEqual(RISK_ROWS);
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
    // `runs-offline` 换成了 `no-phone-home`：产品跑在编码代理里，代理要连
    // 模型，断网就不能用。承诺「断网也能跑」是买家一试就会发现的不实陈述。
    // 断言仍是**逐字全等**，不是"包含"或"长度为 2"：这里要锁住的正是
    // "这两条各是什么"，放宽成计数就等于把本轮修的这个缺陷放回去。
    expect(VERIFIABLE_FACTS.map((f) => f.id)).toEqual([
      'no-executable-code',
      'no-phone-home',
    ]);
  });

  it('claims nothing the product cannot back up', () => {
    // 这两条是站点最硬的一条纪律（绝不声称第三方审计 / 认证 / 渗透测试）
    // 在数据层的落点。`claims.test.mjs` 扫的是构建产物，要先有 dist/；
    // 这条直接扫数据源，单元测试阶段就能拦住。
    const UNSUPPORTED =
      /SOC\s?2|ISO\s?27001|penetration[- ]tested|pen[- ]tested|certified|third[- ]party (?:security )?audit|인증을 받았|제3자 보안 감사/i;
    for (const fact of VERIFIABLE_FACTS) {
      for (const locale of ['en', 'ko'] as const) {
        expect(
          UNSUPPORTED.test(fact.text[locale]),
          `${fact.id}.${locale} makes an unsupported security claim`,
        ).toBe(false);
        expect(fact.text[locale].length, `${fact.id}.${locale}`).toBeGreaterThan(0);
      }
    }
  });
});
