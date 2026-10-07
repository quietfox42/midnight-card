// localStorage 可能被禁用（隐私模式等），所有读写都容错
export function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 忽略 */
  }
}
