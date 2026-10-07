const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function shortTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return timeFmt.format(ms);
}

export const fullTime = (ms: number) => fullFmt.format(ms);

/** "Name <a@b.c>" → "Name" */
export function senderName(sender: string): string {
  const m = /^(.*?)\s*<[^>]+>$/.exec(sender);
  return (m && m[1].replace(/^"|"$/g, '')) || sender;
}
