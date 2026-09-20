import { describe, it, expect } from 'vitest';
import { buildCanonical, signRequest } from '../src/lib/sigv4.ts';

// 取自 AWS 官方 SigV4 测试套件（aws-sig-v4-test-suite）的凭据与时间。
const BASE = {
  headers: {} as Record<string, string>,
  body: Buffer.alloc(0),
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 'service',
  now: new Date('2015-08-30T12:36:00Z'),
};

const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('SigV4 官方测试向量', () => {
  it('get-vanilla：规范请求串与签名逐字符一致', () => {
    const p = buildCanonical({ ...BASE, method: 'GET', url: 'https://example.amazonaws.com/' });
    expect(p.canonicalRequest).toBe(
      ['GET', '/', '', 'host:example.amazonaws.com', 'x-amz-date:20150830T123600Z', '', 'host;x-amz-date', EMPTY_SHA].join('\n'),
    );
    expect(p.scope).toBe('20150830/us-east-1/service/aws4_request');
    expect(p.signature).toBe('5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  });

  it('get-vanilla-query-order-key-case：query 按键排序后再签', () => {
    const p = buildCanonical({
      ...BASE,
      method: 'GET',
      url: 'https://example.amazonaws.com/?Param2=value2&Param1=value1',
    });
    expect(p.canonicalRequest.split('\n')[2]).toBe('Param1=value1&Param2=value2');
    expect(p.signature).toBe('b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500');
  });

  it('get-utf8：非 ASCII 路径只编码一次', () => {
    const p = buildCanonical({
      ...BASE,
      method: 'GET',
      url: 'https://example.amazonaws.com/ሴ',
    });
    expect(p.canonicalRequest.split('\n')[1]).toBe('/%E1%88%B4');
    expect(p.signature).toBe('8318018e0b0f223aa2bbf98705b62bb787dc9c0e678f255a891fd03141be5d85');
  });

  it('头名小写、值折叠空白后才参与签名', () => {
    const p = buildCanonical({
      ...BASE,
      method: 'GET',
      url: 'https://example.amazonaws.com/',
      headers: { 'X-Custom': '  a   b  ' },
    });
    expect(p.canonicalRequest).toContain('x-custom:a b\n');
    expect(p.signedHeaders).toBe('host;x-amz-date;x-custom');
  });
});

describe('S3 专属行为', () => {
  const s3 = { ...BASE, service: 's3', method: 'PUT', url: 'https://acct.r2.cloudflarestorage.com/bucket/masters/a/1.0.0.zip' };

  it('service 为 s3 时补 x-amz-content-sha256 并纳入签名', () => {
    const p = buildCanonical({ ...s3, body: Buffer.from('hello') });
    expect(p.signedHeaders).toContain('x-amz-content-sha256');
    expect(p.headers['x-amz-content-sha256']).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('其它 service 不带该头——否则对不上官方向量', () => {
    const p = buildCanonical({ ...BASE, method: 'GET', url: 'https://example.amazonaws.com/' });
    expect(p.signedHeaders).toBe('host;x-amz-date');
  });

  it('body 变一个字节，签名就变', () => {
    const a = buildCanonical({ ...s3, body: Buffer.from('hello') }).signature;
    const b = buildCanonical({ ...s3, body: Buffer.from('hellp') }).signature;
    expect(a).not.toBe(b);
  });
});

describe('signRequest', () => {
  const headers = signRequest({
    ...BASE,
    service: 's3',
    method: 'PUT',
    url: 'https://acct.r2.cloudflarestorage.com/bucket/masters/a/1.0.0.zip',
    headers: { 'content-type': 'application/zip' },
    body: Buffer.from('zip'),
  });

  it('authorization 结构完整且 SignedHeaders 与实际签的头一致', () => {
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20150830\/us-east-1\/s3\/aws4_request, SignedHeaders=\S+, Signature=[0-9a-f]{64}$/,
    );
    const signed = /SignedHeaders=([^,]+)/.exec(headers.authorization)![1]!.split(';');
    for (const name of signed) expect(headers).toHaveProperty(name);
  });

  it('保留调用方给的头，并补上 host 与日期', () => {
    expect(headers['content-type']).toBe('application/zip');
    expect(headers.host).toBe('acct.r2.cloudflarestorage.com');
    expect(headers['x-amz-date']).toBe('20150830T123600Z');
  });

  it('不泄露密钥本身', () => {
    expect(JSON.stringify(headers)).not.toContain(BASE.secretAccessKey);
  });
});
