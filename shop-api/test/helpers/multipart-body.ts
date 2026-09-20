// 测试用的 multipart 组包器。放在 helpers 下而不是某个 .test.ts 里：
// 从测试文件里 import 会让那个文件的用例在别处被重复收集一遍。

export const TEST_BOUNDARY = '----teachflow-test-boundary';

export interface FilePart {
  field: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

export function buildMultipart(
  fields: Record<string, string>,
  file?: FilePart,
  boundary = TEST_BOUNDARY,
): { body: Buffer; contentType: string } {
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\ncontent-disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        'utf8',
      ),
    );
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\ncontent-disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n` +
          `content-type: ${file.contentType}\r\n\r\n`,
        'utf8',
      ),
      file.data,
      Buffer.from('\r\n', 'utf8'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
