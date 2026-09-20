import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigError, DEFAULT_BUNDLE_SKILL_IDS } from '../src/config.ts';

const FULL: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://teachflow@localhost/teachflow',
  ADMIN_TOKEN: 'admin-token-value',
  DOWNLOAD_TOKEN_SECRET: 'x'.repeat(32),
  POLAR_WEBHOOK_SECRET: 'whsec_test',
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'akid',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'teachflow-masters',
  RESEND_API_KEY: 're_test',
  MAIL_FROM: 'TeachFlow <noreply@tryteachflow.com>',
  MASTER_DIR: '/srv/teachflow/masters',
  PUBLIC_BASE_URL: 'https://tryteachflow.com',
};

describe('loadConfig', () => {
  it('完整环境变量下返回配置，端口与 TTL 走默认值', () => {
    const config = loadConfig(FULL);
    expect(config.port).toBe(8787);
    expect(config.downloadTokenTtlDays).toBe(30);
    expect(config.morProvider).toBe('polar');
    expect(config.dailyMailBudget).toBe(80);
    expect(config.bundleSkillIds).toEqual([...DEFAULT_BUNDLE_SKILL_IDS]);
    expect(config.bundleSkillIds).toHaveLength(6);
  });

  it('一次列出全部缺失项，而不是只报第一个', () => {
    const env = { ...FULL };
    delete env.R2_BUCKET;
    delete env.MAIL_FROM;
    delete env.MASTER_DIR;

    try {
      loadConfig(env);
      expect.unreachable('应当抛出 ConfigError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const problems = (err as ConfigError).problems;
      expect(problems).toHaveLength(3);
      expect(problems.join('\n')).toContain('R2_BUCKET');
      expect(problems.join('\n')).toContain('MAIL_FROM');
      expect(problems.join('\n')).toContain('MASTER_DIR');
    }
  });

  it('空字符串等同于缺失', () => {
    expect(() => loadConfig({ ...FULL, ADMIN_TOKEN: '   ' })).toThrow(/ADMIN_TOKEN/);
  });

  it('下载令牌密钥不足 32 字节即拒绝', () => {
    expect(() => loadConfig({ ...FULL, DOWNLOAD_TOKEN_SECRET: 'x'.repeat(31) })).toThrow(
      /至少需要 32 字节/,
    );
  });

  it('PUBLIC_BASE_URL 带路径即拒绝', () => {
    expect(() => loadConfig({ ...FULL, PUBLIC_BASE_URL: 'https://tryteachflow.com/en' })).toThrow(
      /PUBLIC_BASE_URL/,
    );
  });

  it('MOR_PROVIDER 只接受 polar 与 paddle', () => {
    expect(loadConfig({ ...FULL, MOR_PROVIDER: 'paddle' }).morProvider).toBe('paddle');
    expect(() => loadConfig({ ...FULL, MOR_PROVIDER: 'stripe' })).toThrow(/MOR_PROVIDER/);
  });

  it('BUNDLE_SKILL_IDS 可覆盖，非法 id 被拒绝', () => {
    expect(loadConfig({ ...FULL, BUNDLE_SKILL_IDS: 'a-skill, b-skill' }).bundleSkillIds).toEqual([
      'a-skill',
      'b-skill',
    ]);
    expect(() => loadConfig({ ...FULL, BUNDLE_SKILL_IDS: 'Bad_Skill' })).toThrow(/非法 skill id/);
  });
});
