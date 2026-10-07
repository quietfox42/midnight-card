-- 去重：同一封邮件（对方 MTA 重试、重复投递）只存一次。
-- 没有 Message-ID 的邮件 message_id 为 NULL，唯一索引里 NULL 互不冲突，照常写入。
ALTER TABLE emails ADD COLUMN message_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_address_message_id ON emails (address, message_id);
