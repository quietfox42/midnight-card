// 测试只用到 node:sqlite 的这一小部分；不为此引入 @types/node
declare module 'node:sqlite' {
  interface StatementSync {
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}

declare module '*.sql?raw' {
  const sql: string;
  export default sql;
}
