import { createHash, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import type { Handler, RequestContext } from '../http/router.ts';
import { BodyTooLarge, readRawBody, sendError, sendJson } from '../http/respond.ts';
import { fieldOf, fileOf, MultipartError, parseMultipart } from '../lib/multipart.ts';
import { validateSkillZip } from '../lib/zip-validate.ts';
import { compareSemver, isSemver } from '../lib/frontmatter.ts';
import { masterKey, type Storage } from '../lib/storage.ts';
import { getRelease, insertRelease, latestVersion, VersionConflict } from '../db/releases.ts';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export interface ReleaseDeps {
  adminToken: string;
  pool: Pool;
  storage: Storage;
  /**
   * 投递后台任务。发版事务提交之后才调用——pg-boss v10 没有「用我的连接」
   * 这种 API，硬塞进同一事务要直接写它的私有表，跨版本很脆。
   * 代价是提交与投递之间有一个窗口：投递失败时接口回 500 并在正文里
   * 带上 release id，worker 的 reconcile 任务也会补做归档。
   */
  enqueue(job: string, data: Record<string, unknown>): Promise<void>;
}

function authorized(header: string | string[] | undefined, expected: string): boolean {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || !raw.startsWith('Bearer ')) return false;
  const provided = Buffer.from(raw.slice(7), 'utf8');
  const want = Buffer.from(expected, 'utf8');
  // 先比长度再定长比较：timingSafeEqual 长度不等会抛错。
  return provided.length === want.length && timingSafeEqual(provided, want);
}

export function adminReleasesRoute(deps: ReleaseDeps): Handler {
  return async (ctx: RequestContext) => {
    if (!authorized(ctx.req.headers.authorization, deps.adminToken)) {
      sendError(ctx.res, 401, 'unauthorized', '缺少或不正确的 Bearer token。');
      return;
    }

    let body: Buffer;
    try {
      body = await readRawBody(ctx.req, MAX_UPLOAD_BYTES);
    } catch (err) {
      if (err instanceof BodyTooLarge) {
        sendError(ctx.res, 413, 'payload_too_large', '上传体积超出上限。', {
          limit_bytes: MAX_UPLOAD_BYTES,
        });
        return;
      }
      throw err;
    }

    let parts;
    try {
      parts = parseMultipart(body, ctx.req.headers['content-type']);
    } catch (err) {
      if (err instanceof MultipartError) {
        sendError(ctx.res, 400, 'bad_multipart', err.message);
        return;
      }
      throw err;
    }

    const skill = fieldOf(parts, 'skill');
    const version = fieldOf(parts, 'version');
    const changelogEn = fieldOf(parts, 'changelog_en');
    const changelogKo = fieldOf(parts, 'changelog_ko');
    const zip = fileOf(parts, 'zip');

    const missing = [
      ['skill', skill],
      ['version', version],
      ['changelog_en', changelogEn],
      ['changelog_ko', changelogKo],
      ['zip', zip],
    ]
      .filter(([, v]) => v === undefined || v === '')
      .map(([k]) => k as string);
    if (missing.length > 0) {
      sendError(ctx.res, 400, 'missing_fields', '缺少必填字段。', { fields: missing });
      return;
    }
    if (!isSemver(version!)) {
      sendError(ctx.res, 400, 'bad_version', '版本号必须是 x.y.z。');
      return;
    }

    const validation = validateSkillZip(zip!.data, skill!);
    if (!validation.ok) {
      sendError(ctx.res, 400, 'invalid_zip', validation.reason);
      return;
    }
    if (validation.version !== version) {
      sendError(
        ctx.res,
        400,
        'version_mismatch',
        `SKILL.md 里写的是 ${validation.version}，请求里写的是 ${version}。`,
      );
      return;
    }

    // 路由层先查一次，是为了给出可读的 409；真正的并发闸是表上的 UNIQUE。
    if (await getRelease(deps.pool, skill!, version!)) {
      sendError(ctx.res, 409, 'version_exists', '该版本已经发过了。', { skill, version });
      return;
    }
    const latest = await latestVersion(deps.pool, skill!);
    if (latest && compareSemver(version!, latest) <= 0) {
      sendError(ctx.res, 409, 'version_not_newer', '新版本号必须高于当前最高版本。', {
        latest,
        attempted: version,
      });
      return;
    }

    const sha256 = createHash('sha256').update(zip!.data).digest('hex');

    // 先落盘再写库：反过来的话，库里会有一条指向不存在文件的发版记录。
    // 反向的失败（盘上多一个没人引用的文件）无害。
    await deps.storage.putMaster(skill!, version!, zip!.data);

    let release;
    try {
      release = await insertRelease(deps.pool, {
        skillId: skill!,
        version: version!,
        sha256,
        sizeBytes: zip!.data.length,
        r2Key: masterKey(skill!, version!),
        changelogEn: changelogEn!,
        changelogKo: changelogKo!,
      });
    } catch (err) {
      if (err instanceof VersionConflict) {
        sendError(ctx.res, 409, 'version_exists', '该版本已经发过了。', { skill, version });
        return;
      }
      throw err;
    }

    try {
      await deps.enqueue('archive-master', { skillId: skill, version });
      await deps.enqueue('notify-update', { releaseId: release.id, skillId: skill, version });
    } catch (err) {
      sendError(
        ctx.res,
        500,
        'enqueue_failed',
        '发版记录已写入，但后台任务没投递成功。重投任务即可，不要重新上传。',
        { release_id: release.id },
      );
      return;
    }

    sendJson(ctx.res, 201, {
      skill: release.skillId,
      version: release.version,
      sha256: release.sha256,
      size_bytes: release.sizeBytes,
      published_at: release.publishedAt.toISOString(),
    });
  };
}
