-- 2026-09-29 漏斗统计（docs/2026-09-29-funnel-analytics-plan.md）。
--
-- 五步事件的事实表：page_view（Caddy 日志摄取）/ checkout_click（站内中转）/
-- checkout_open（Polar checkout.created）/ order_paid（Polar order.paid）/
-- success_return（支付成功回跳）。
--
-- 隐私口径（privacy.md 已同步更新）：这里**不存 IP**、不存邮箱；user_agent 与
-- referrer 只为区分爬虫与流量来源，vid 是点击时随机生成的一次性 id，不跨访问
-- 持久。因此这张表的保留期不受「服务器日志 ≤30 天」约束，长期保留用于趋势。

CREATE TABLE IF NOT EXISTS funnel_events (
  id           bigserial PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  event        text NOT NULL
                 CHECK (event IN ('page_view','checkout_click','checkout_open',
                                  'order_paid','success_return')),
  src          text,                          -- header|hero|home-bottom|cta|buy-page|other
  lang         text CHECK (lang IN ('en','ko') OR lang IS NULL),
  vid          text,                          -- 点击时生成的一次性关联 id
  checkout_id  text,                          -- Polar checkout / session id
  order_id     text,                          -- Polar order id
  amount_cents integer,
  currency     char(3),
  user_agent   text,
  referrer     text,
  bot          boolean NOT NULL DEFAULT false,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_funnel_events_step
  ON funnel_events (event, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_events_checkout
  ON funnel_events (checkout_id) WHERE checkout_id IS NOT NULL;

-- Caddy 访问日志摄取器的断点记录（key = 'caddy-access'，value = {offset}）。
-- 轮转后文件变小，摄取器检测到 size < offset 会自动从头读。
CREATE TABLE IF NOT EXISTS funnel_log_state (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
