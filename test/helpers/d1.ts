// 用 node:sqlite 实现的最小 D1：执行真实的迁移 SQL 和业务 SQL，并记录每条查询。
import { DatabaseSync } from 'node:sqlite';
import init from '../../migrations/0001_init.sql?raw';
import messageId from '../../migrations/0002_message_id.sql?raw';

export interface TestD1 {
  db: D1Database;
  sqlite: DatabaseSync;
  /** 每次 all/first/run 记一条 */
  queries: string[];
}

export function createD1(): TestD1 {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(init);
  sqlite.exec(messageId);
  const queries: string[] = [];

  const statement = (sql: string, params: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    async all() {
      queries.push(sql);
      return { results: sqlite.prepare(sql).all(...params), success: true, meta: {} };
    },
    async first(column?: string) {
      queries.push(sql);
      const row = sqlite.prepare(sql).get(...params) ?? null;
      return column && row ? row[column] : row;
    },
    async run() {
      queries.push(sql);
      const r = sqlite.prepare(sql).run(...params);
      return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });

  const db = { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
  return { db, sqlite, queries };
}

export interface Row {
  address: string;
  received_at: number;
  subject?: string;
  html?: string | null;
  message_id?: string | null;
}

export function insert(t: TestD1, rows: Row[]): void {
  const stmt = t.sqlite.prepare(
    'INSERT INTO emails (address, sender, subject, text, html, received_at, message_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const r of rows) stmt.run(r.address, 'a@b.test', r.subject ?? '', 'body', r.html ?? null, r.received_at, r.message_id ?? null);
}
