import { describe, it, expect } from 'vitest';
import {
  boundaryOf,
  fieldOf,
  fileOf,
  MultipartError,
  parseMultipart,
} from '../src/lib/multipart.ts';
import { buildMultipart, TEST_BOUNDARY as B } from './helpers/multipart-body.ts';

describe('boundaryOf', () => {
  it('取出 boundary', () => {
    expect(boundaryOf('multipart/form-data; boundary=abc123')).toBe('abc123');
  });

  it('带引号的 boundary 去引号', () => {
    expect(boundaryOf('multipart/form-data; boundary="a b c"')).toBe('a b c');
  });

  it('参数名大小写不敏感', () => {
    expect(boundaryOf('Multipart/Form-Data; BOUNDARY=xyz')).toBe('xyz');
  });

  it('不是 multipart 即报错', () => {
    expect(() => boundaryOf('application/json')).toThrow(MultipartError);
  });

  it('缺 boundary 即报错', () => {
    expect(() => boundaryOf('multipart/form-data')).toThrow(MultipartError);
  });

  it('缺 content-type 即报错', () => {
    expect(() => boundaryOf(undefined)).toThrow(MultipartError);
  });
});

describe('parseMultipart', () => {
  it('解析出文本字段与文件', () => {
    const { body, contentType } = buildMultipart(
      { skill: 'lesson-workflow', version: '1.0.0' },
      {
        field: 'zip',
        filename: 'lesson-workflow.zip',
        contentType: 'application/zip',
        data: Buffer.from('PKfake'),
      },
    );
    const parts = parseMultipart(body, contentType);
    expect(parts.map((p) => p.name)).toEqual(['skill', 'version', 'zip']);
    expect(fieldOf(parts, 'skill')).toBe('lesson-workflow');
    expect(fieldOf(parts, 'version')).toBe('1.0.0');
    const file = fileOf(parts, 'zip')!;
    expect(file.filename).toBe('lesson-workflow.zip');
    expect(file.contentType).toBe('application/zip');
    expect(file.data.equals(Buffer.from('PKfake'))).toBe(true);
  });

  it('二进制内容原样保留，包括 0x00 与 boundary 的近似串', () => {
    const data = Buffer.concat([
      Buffer.from([0x00, 0x0d, 0x0a, 0xff, 0xfe]),
      Buffer.from(`--${B}x not a real delimiter`, 'utf8'),
      Buffer.from([0x00]),
    ]);
    const { body, contentType } = buildMultipart({}, {
      field: 'zip',
      filename: 'a.bin',
      contentType: 'application/octet-stream',
      data,
    });
    const file = fileOf(parseMultipart(body, contentType), 'zip')!;
    expect(file.data.equals(data)).toBe(true);
  });

  it('字段值可以为空串', () => {
    const { body, contentType } = buildMultipart({ changelog_ko: '' });
    expect(fieldOf(parseMultipart(body, contentType), 'changelog_ko')).toBe('');
  });

  it('字段值里的换行与分号不影响切分', () => {
    const value = 'line1\r\nline2; name="fake"\r\n';
    const { body, contentType } = buildMultipart({ changelog_en: value });
    expect(fieldOf(parseMultipart(body, contentType), 'changelog_en')).toBe(value);
  });

  it('filename 里含分号时仍能取全', () => {
    const raw =
      `--${B}\r\ncontent-disposition: form-data; name="zip"; filename="a;b.zip"\r\n\r\nX\r\n--${B}--\r\n`;
    const file = fileOf(
      parseMultipart(Buffer.from(raw, 'utf8'), `multipart/form-data; boundary=${B}`),
      'zip',
    )!;
    expect(file.filename).toBe('a;b.zip');
  });

  it('fieldOf 不会把文件当成文本字段', () => {
    const { body, contentType } = buildMultipart({}, {
      field: 'zip',
      filename: 'a.zip',
      contentType: 'application/zip',
      data: Buffer.from('X'),
    });
    const parts = parseMultipart(body, contentType);
    expect(fieldOf(parts, 'zip')).toBeUndefined();
    expect(fileOf(parts, 'zip')).toBeDefined();
  });

  it('fileOf 不会把文本字段当成文件', () => {
    const { body, contentType } = buildMultipart({ zip: 'not-a-file' });
    expect(fileOf(parseMultipart(body, contentType), 'zip')).toBeUndefined();
  });

  it('正文里没有 boundary 即报错', () => {
    expect(() =>
      parseMultipart(Buffer.from('just some bytes'), `multipart/form-data; boundary=${B}`),
    ).toThrow(MultipartError);
  });

  it('分段缺 content-disposition 即报错', () => {
    const raw = `--${B}\r\ncontent-type: text/plain\r\n\r\nX\r\n--${B}--\r\n`;
    expect(() => parseMultipart(Buffer.from(raw), `multipart/form-data; boundary=${B}`)).toThrow(
      MultipartError,
    );
  });

  it('分段缺头部终止符即报错，而不是静默产出空数据', () => {
    const raw = `--${B}\r\ncontent-disposition: form-data; name="a"\r\n--${B}--\r\n`;
    expect(() => parseMultipart(Buffer.from(raw), `multipart/form-data; boundary=${B}`)).toThrow(
      MultipartError,
    );
  });
});
