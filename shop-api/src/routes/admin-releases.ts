import { createHash, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import type { Handler, RequestContext } from '../http/router.ts';
import { BodyTooLarge, readRawBody, sendJson } from '../http/respond.ts';
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
      sendJson(ctx.res, 401, { error: 'unauthorized' });
      return;
    }

    let body: Buffer;
    try {
      body = await readRawBody(ctx.req, MAX_UPLOAD_BYTES);
    } catch (err) {
      if (err instanceof BodyTooLarge) {
        sendJson(ctx.res, 413, { error: 'payload_too_large', limit_bytes: MAX_UPLOAD_BYTES });
        return;
      }
      throw err;
    }

    let parts;
    try {
      parts = parseMultipart(body, ctx.req.headers['content-type']);
    } catch (err) {
      if (err instanceof MultipartError) {
        sendJson(ctx.res, 400, { error: 'bad_multipart', detail: err.message });
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
      sendJson(ctx.res, 400, { error: 'missing_fields', fields: missing });
      return;
    }
    if (!isSemver(version!)) {
      sendJson(ctx.res, 400, { error: 'bad_version', detail: '版本号必须是 x.y.z' });
      return;
    }

    const validation = validateSkillZip(zip!.data, skill!);
    if (!validation.ok) {
      sendJson(ctx.res, 400, { error: 'invalid_zip', detail: validation.reason });
      return;
    }
    if (validation.version !== version) {
      sendJson(ctx.res, 400, {
        error: 'version_mismatch',
        detail: `SKILL.md 里写的是 ${validation.version}，请求里写的是 ${version}`,
      });
      return;
    }

    // 路由层先查一次，是为了给出可读的 409；真正的并发闸是表上的 UNIQUE。
    if (await getRelease(deps.pool, skill!, version!)) {
      sendJson(ctx.res, 409, { error: 'version_exists', skill, version });
      return;
    }
    const latest = await latestVersion(deps.pool, skill!);
    if (latest && compareSemver(version!, latest) <= 0) {
      sendJson(ctx.res, 409, { error: 'version_not_newer', latest, attempted: version });
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
        sendJson(ctx.res, 409, { error: 'version_exists', skill, version });
        return;
      }
      throw err;
    }

    try {
      await deps.enqueue('archive-master', { skillId: skill, version });
      await deps.enqueue('notify-update', { releaseId: release.id, skillId: skill, version });
    } catch (err) {
      sendJson(ctx.res, 500, {
        error: 'enqueue_failed',
        detail: (err as Error).message,
        release_id: release.id,
        note: '发版记录已写入，重投任务即可，不要重新上传',
      });
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
