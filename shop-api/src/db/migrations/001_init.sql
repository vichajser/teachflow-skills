CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS skills (
  id          text PRIMARY KEY,               -- = SKILL.md frontmatter name
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS releases (
  id            bigserial PRIMARY KEY,
  skill_id      text NOT NULL REFERENCES skills(id),
  version       text NOT NULL,                -- semver，严格递增
  sha256        char(64) NOT NULL,
  size_bytes    integer NOT NULL,
  r2_key        text NOT NULL,                -- masters/<skill>/<version>.zip
  changelog_en  text NOT NULL,
  changelog_ko  text NOT NULL,
  published_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, version)                  -- 已售版本不可变
);

CREATE TABLE IF NOT EXISTS orders (
  id           text PRIMARY KEY,              -- provider 侧 order id
  provider     text NOT NULL,                 -- 'polar' | 'paddle'
  buyer_email  citext NOT NULL,
  amount_cents integer NOT NULL,
  currency     char(3) NOT NULL,
  locale       text NOT NULL DEFAULT 'en'
                 CHECK (locale IN ('en','ko')),
  status       text NOT NULL
                 CHECK (status IN ('paid','refunded','chargeback')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_buyer_email_idx ON orders (buyer_email);

CREATE TABLE IF NOT EXISTS entitlements (
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  skill_id text NOT NULL REFERENCES skills(id),
  PRIMARY KEY (order_id, skill_id)
);

CREATE TABLE IF NOT EXISTS downloads (
  id            bigserial PRIMARY KEY,
  order_id      text NOT NULL REFERENCES orders(id),
  skill_id      text NOT NULL,
  version       text NOT NULL,
  ip            inet NOT NULL,
  user_agent    text,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS downloads_order_idx ON downloads (order_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  provider    text NOT NULL,
  event_id    text NOT NULL,
  payload     jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE IF NOT EXISTS update_notices (
  order_id   text   NOT NULL REFERENCES orders(id),
  release_id bigint NOT NULL REFERENCES releases(id),
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, release_id)
);

-- Resend 每日 100 封硬顶的本地账。day 是 UTC 日历日。
CREATE TABLE IF NOT EXISTS email_quota (
  day   date PRIMARY KEY,
  sent  integer NOT NULL DEFAULT 0
);

-- 重发下载链接的限流。key 是 'ip:<addr>' 或 'email:<sha256>'，
-- 不存明文邮箱，过期行由 worker 清理。
CREATE TABLE IF NOT EXISTS rate_limits (
  key         text PRIMARY KEY,
  hits        integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);
