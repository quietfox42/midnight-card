-- 可重复执行（IF NOT EXISTS），setup / deploy 每次都会运行一遍。
CREATE TABLE IF NOT EXISTS emails (
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
