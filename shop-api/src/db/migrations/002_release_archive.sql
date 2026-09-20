-- 归档到 R2 的时刻。NULL 表示还没归档成功。
--
-- 为什么要记在库里：发版接口在事务提交之后才投递 archive-master，中间那个
-- 窗口里进程挂掉，归档就再也没人做。靠「问 R2 有没有这个 key」也能判断，
-- 但那是一次网络往返乘以版本数，而这张表本来就要读。
ALTER TABLE releases ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- reconcile 每天只关心还没归档的那几行，部分索引让它不必全表扫。
CREATE INDEX IF NOT EXISTS releases_unarchived_idx
  ON releases (published_at) WHERE archived_at IS NULL;
