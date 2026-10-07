// 界面文案集中在这里，保证同一个动作、同一个对象在全流程里用同一个词：
// 地址 / 邮件 / 验证码；复制 → 已复制。
import type { PrefixError } from '../../shared/address';

export const BRAND = '午夜黑卡';

export const T = {
  addressLabel: '你的临时地址',
  copy: '复制',
  copied: '已复制',
  renew: '换一个',
  customize: '自定义',
  copyAddress: '复制地址',
  copyFailed: '无法写入剪贴板。请长按文字手动复制。',
  addressPlaceholder: '正在生成地址',

  cardFoot: (hours: number) => `公开 · ${hours} 小时有效`,
  issuing: '正在签发新地址',

  inbox: '邮件',
  refresh: '立即刷新',
  status: {
    loading: '连接中',
    ok: '自动刷新中',
    error: '刷新失败，稍后自动重试',
    rate_limited: '请求有点频繁，1 分钟后自动重试',
  },
  pollEvery: (seconds: number) => `每 ${seconds} 秒`,

  emptyTitle: '等待第一封邮件',
  emptyBody: '把地址填到注册页，邮件通常几秒内到达。',

  serverErrorTitle: '连不上服务器',
  serverErrorBody: '请检查网络，然后刷新页面。',
  reload: '刷新页面',

  noSubject: '无主题',
  unknownSender: '未知发件人',
  codeLabel: '验证码',
  copyCode: (code: string) => `复制验证码 ${code}`,
  openLink: '打开链接',

  back: '返回',
  selectMail: '选择一封邮件查看内容。',
  bodyFormat: '正文格式',
  viewHtml: '网页',
  viewText: '纯文本',
  emptyBody2: '这封邮件没有正文。',
  mailLoadError: '这封邮件读取失败，可能已超过保留时间被删除。请返回列表。',
  mailFrameTitle: '邮件正文',

  sheetTitle: '自定义地址',
  sheetHelp: '3–32 位，可用小写字母、数字、点、下划线、连字符。',
  sheetInputLabel: '地址前缀',
  sheetSubmit: '使用这个地址',
  cancel: '取消',
} as const;

export const PREFIX_ERRORS: Record<PrefixError, string> = {
  length: '长度需要在 3–32 位之间。',
  chars: '只能使用小写字母、数字、点、下划线、连字符。',
  dots: '点不能放在开头或结尾，也不能连续出现。',
  reserved: '这个前缀已被保留，请换一个。',
};
