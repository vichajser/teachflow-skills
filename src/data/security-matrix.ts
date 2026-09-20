import type { Locale } from '@/i18n/config';

export interface SecurityRow {
  /** Agensi 扫描项名称，逐字不改——审核员按名称对照 */
  scan: string;
  practice: Record<Locale, string>;
  verify: Record<Locale, string>;
}

/**
 * `verify` 列写的是读者**照着做一定成立**的检查路径。
 *
 * 这一列比 `practice` 更容易出错，因为它邀请读者去 grep。本包里有 6 个
 * SKILL.md，每份都带一段"금지 사항"公告，逐字写着它**禁止**的东西：
 * `~/`、`/etc/`、`sudo`、`rm -rf` 都在那段公告里各出现一次。
 * 所以"搜不到这些字符串"是假的——搜得到，只是全部落在禁止公告内。
 * verify 列据此改为"只出现在禁止公告里"，读者真去搜时得到的正是这个结果。
 */
export const SECURITY_MATRIX: readonly SecurityRow[] = [
  {
    scan: 'Prompt injection',
    practice: {
      en: 'Uploaded textbook content is handled as data. It is never executed as instructions.',
      ko: '업로드한 교재 내용은 데이터로만 처리하며, 지시문으로 실행하지 않습니다.',
    },
    verify: {
      en: 'Read the skill files — every instruction the model follows is in plain Markdown you can review.',
      ko: '스킬 파일을 직접 읽어 보세요. 모델이 따르는 모든 지시가 읽을 수 있는 Markdown에 그대로 있습니다.',
    },
  },
  {
    scan: 'Data exfiltration',
    practice: {
      en: 'File reads and writes stay inside the current working directory; output goes to outputs/. Never ~, /etc or /usr.',
      ko: '파일 읽기와 쓰기는 현재 작업 폴더 안으로 제한되며 산출물은 outputs/에 저장됩니다. ~, /etc, /usr는 건드리지 않습니다.',
    },
    verify: {
      en: 'Search the package for a path outside the working directory. The only matches are the lines that forbid those paths.',
      ko: '패키지에서 작업 폴더 밖의 경로를 검색해 보세요. 나오는 것은 그 경로를 금지하는 문장뿐입니다.',
    },
  },
  {
    scan: 'Secret detection',
    practice: {
      en: 'No hardcoded credentials. Where a credential is needed, only the environment variable name appears.',
      ko: '하드코딩된 인증 정보가 없습니다. 인증이 필요한 경우에도 환경 변수 이름만 등장합니다.',
    },
    verify: {
      en: 'Grep the package for keys and tokens — the files are plain text and fully searchable.',
      ko: '패키지 전체를 검색해 보세요. 모두 일반 텍스트라 그대로 확인할 수 있습니다.',
    },
  },
  {
    scan: 'Dangerous commands',
    practice: {
      en: 'Only whitelisted tools run: python-pptx, python-docx, openpyxl, soffice/LibreOffice, and headless Chrome for local HTML rendering only.',
      ko: '허용된 도구만 실행합니다: python-pptx, python-docx, openpyxl, soffice/LibreOffice, 그리고 로컬 HTML 렌더링 전용 headless Chrome.',
    },
    verify: {
      en: 'Every command the skills may run is listed in the skill files themselves.',
      ko: '스킬이 실행할 수 있는 모든 명령이 스킬 파일 안에 명시되어 있습니다.',
    },
  },
  {
    scan: 'Obfuscation',
    practice: {
      en: 'No base64 blobs, no escape tricks, no invisible Unicode.',
      ko: 'base64 문자열, 이스케이프 트릭, 보이지 않는 유니코드를 쓰지 않습니다.',
    },
    verify: {
      en: 'Open any file in the package — all of it is readable prose and structured instructions.',
      ko: '패키지의 아무 파일이나 열어 보세요. 전부 읽을 수 있는 문장과 구조화된 지시입니다.',
    },
  },
  {
    scan: 'External fetch',
    practice: {
      en: 'No network access at all: no external URLs, no remote script downloads, no external API calls.',
      ko: '네트워크 접근이 전혀 없습니다. 외부 URL 요청, 원격 스크립트 다운로드, 외부 API 호출을 하지 않습니다.',
    },
    verify: {
      en: 'Run the skills with your machine offline — everything still works.',
      ko: '인터넷을 끊은 상태에서 실행해 보세요. 그대로 동작합니다.',
    },
  },
  {
    scan: 'Credential access',
    practice: {
      en: 'No reads from the keychain, .ssh, .aws, browser credential stores, or any other credential location.',
      ko: '키체인, .ssh, .aws, 브라우저 인증 저장소 등 어떤 인증 정보도 읽지 않습니다.',
    },
    verify: {
      en: 'Search the package for those credential locations — none appear.',
      ko: '패키지에서 해당 인증 정보 경로들을 검색해 보세요. 전혀 나오지 않습니다.',
    },
  },
  {
    scan: 'Privilege escalation',
    practice: {
      en: 'No sudo, no chmod 777, no rm -rf, no curl | sh, no eval.',
      ko: 'sudo, chmod 777, rm -rf, curl | sh, eval을 사용하지 않습니다.',
    },
    verify: {
      en: 'Search the package for these commands. None is ever invoked. Every occurrence sits inside a line that forbids it, except the letters "eval" inside the English words "evaluate" and "Evaluation" in teacher-language word lists.',
      ko: '패키지에서 이 명령들을 검색해 보세요. 실제로 실행되는 곳은 없습니다. 나오는 것은 모두 그것을 금지하는 문장 안이고, 예외는 교사용 어휘 목록의 영어 단어 "evaluate", "Evaluation" 안에 들어간 "eval" 철자뿐입니다.',
    },
  },
] as const;

/**
 * 两条可验证事实——比任何断言都强，因为读者能自己走一遍。
 *
 * **两条都必须是买家拿到的 zip 里真实存在的东西。** 早先的第二条写着
 * "The package ships verify.py"，那是照着 `TeachFlow-KR/` 仓库的结构写的，
 * 不是照着交付物写的：`unzip -l` 六个 zip，里面只有 `SKILL.md`、
 * `references/*.md`、`README.md`、`SECURITY.md`、`LICENSE`——
 * **没有 verify.py，也没有 skills/ 或 docs/ 目录**。承诺一个随包不存在的
 * 检查工具，是买家打开压缩包第一眼就会发现的不实陈述。
 *
 * 替换的这条只复述 `_SPEC.md` 已经约束住的东西（零网络访问），
 * 并且与上面 `External fetch` 那行的 verify 列是同一个检查。
 * **不新造任何可验证性声明**：本站从不声称通过了第三方审计、渗透测试
 * 或任何形式的安全认证——那些我们拿不出证据，而 Agensi 与 Stripe 会去查。
 *
 * 第一条的"32 个 Markdown 文档"已按六个 zip 核对：6 份 SKILL.md +
 * 26 份 references/*.md = 32，属实。
 */
export const VERIFIABLE_FACTS = [
  {
    id: 'no-executable-code',
    text: {
      en: 'The six skills are 32 Markdown documents with no executable code. Every instruction they contain can be read as plain text.',
      ko: '스킬 6종은 실행 코드가 없는 Markdown 문서 32개입니다. 담긴 모든 지시를 일반 텍스트로 읽어 볼 수 있습니다.',
    },
  },
  {
    id: 'runs-offline',
    text: {
      en: 'You can disconnect from the internet before you run them. The skills make no network request of any kind, so nothing you feed them can leave your machine — and the check costs you one click.',
      ko: '실행하기 전에 인터넷을 끊어 보셔도 됩니다. 스킬은 어떤 네트워크 요청도 하지 않으므로 입력하신 자료가 컴퓨터 밖으로 나갈 수 없습니다. 확인에 드는 수고는 클릭 한 번뿐입니다.',
    },
  },
] as const;
