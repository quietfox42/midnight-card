-- 初始表结构。用 IF NOT EXISTS，以便在迁移系统接管前就用 schema.sql 建过表的库上安全执行。
CREATE TABLE IF NOT EXISTS emails (
  -- AUTOINCREMENT 不能省：否则表被清空后 id 会从 1 重新开始，前端的 since 游标会漏掉新邮件
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  address     TEXT    NOT NULL,           -- 收件地址（小写）
  sender      TEXT    NOT NULL DEFAULT '',
  subject     TEXT    NOT NULL DEFAULT '',
  text        TEXT,                       -- 纯文本正文（已截断）
  html        TEXT,                       -- HTML 正文（已截断）
  code        TEXT,                       -- 收信时提取的验证码
  link        TEXT,                       -- 收信时提取的验证/激活链接
  received_at INTEGER NOT NULL            -- unix 毫秒
);

-- 列表/增量轮询：WHERE address = ? AND id > ? ORDER BY id DESC LIMIT n
CREATE INDEX IF NOT EXISTS idx_emails_address_id ON emails (address, id);
-- 定时清理：DELETE ... WHERE received_at < ?
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails (received_at);
