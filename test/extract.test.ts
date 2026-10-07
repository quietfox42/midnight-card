import { describe, expect, it } from 'vitest';
import { decodeEntities, extract, findCode, findLink, htmlToText } from '../src/worker/extract';

describe('验证码提取', () => {
  const cases: { name: string; subject: string; text?: string; html?: string; code: string | null }[] = [
    {
      name: 'Google（G- 前缀，验证码在主题中）',
      subject: 'G-482913 is your Google verification code',
      text: 'Google\n\nYour verification code is G-482913.\n\nDon’t share it with anyone.',
      code: '482913',
    },
    {
      name: 'Google 中文',
      subject: 'Google 验证码',
      text: '您的 Google 验证码为：735102\n此验证码将在 10 分钟后失效。',
      code: '735102',
    },
    {
      name: 'GitHub launch code',
      subject: '[GitHub] Please verify your device',
      text:
        'Hey octocat!\n\nA sign in attempt requires further verification because we did not recognize your device. ' +
        'To complete the sign in, enter the verification code on the unrecognized device.\n\nDevice: Chrome on Windows\n' +
        'Verification code: 193846\n\nIf you did not attempt to sign in to your account, your password may be compromised.',
      code: '193846',
    },
    {
      name: '微信',
      subject: '微信安全验证',
      text: '【微信】验证码 628401，用于微信账号登录，5分钟内有效。如非本人操作，请忽略本邮件。',
      code: '628401',
    },
    {
      name: 'Microsoft 安全代码',
      subject: 'Microsoft account security code',
      text: 'Please use the following security code for the Microsoft account ab***@example.com.\n\nSecurity code: 4831\n\nIf you don\'t recognize the Microsoft account, you can click here to remove your email.',
      code: '4831',
    },
    {
      name: 'Apple 2024 年份不误判',
      subject: 'Verify your Apple ID email address',
      text: 'Apple ID\n\nVerification code:\n\n503717\n\nCopyright © 2024 Apple Inc. All rights reserved.',
      code: '503717',
    },
    {
      name: '分组数字 123 456',
      subject: 'Your login code',
      text: 'Enter this code to sign in: 482 913',
      code: '482913',
    },
    {
      name: '字母数字混合 OTP',
      subject: 'Sign-in request',
      text: 'Your one-time passcode (OTP) is K7Q2ZP. It expires in 15 minutes.',
      code: 'K7Q2ZP',
    },
    {
      name: '一次性密码',
      subject: '登录提醒',
      text: '您正在登录，一次性密码：90817264，请勿泄露。',
      code: '90817264',
    },
    {
      name: '纯 HTML 邮件',
      subject: 'Confirm your email',
      html: '<html><head><style>.a{color:#FF0000;padding:10px}</style></head><body><p>Your verification code is</p><p style="font-size:24px"><b>551203</b></p></body></html>',
      code: '551203',
    },
    {
      name: '营销邮件没有验证码',
      subject: 'Our autumn sale is here',
      text: 'Save up to 50% this week only. Use promo code at checkout. Free shipping on orders over $1999.',
      code: null,
    },
    {
      name: 'Unicode / barcode 不触发',
      subject: 'Newsletter #2025',
      text: 'We now support Unicode 15 and barcode scanning in version 4.2.1.',
      code: null,
    },
    {
      name: '纯文本只是占位，验证码在 HTML 里',
      subject: 'Your sign-in request',
      text: 'View this email in your browser: https://mail.example.test/view/abc',
      html: '<table><tr><td>Your verification code</td></tr><tr><td><strong>662190</strong></td></tr></table>',
      code: '662190',
    },
    {
      name: '关键词在样板文字里出现很多次，真正的验证码在后面',
      subject: 'Security alert',
      text: 'Never share a code with anyone. '.repeat(30) + '\nVerification code: 551122',
      code: '551122',
    },
    {
      name: '零宽字符和数字实体',
      subject: 'Login',
      html: '<p>&#8203;&zwnj;&nbsp;Your code&#58;&#x20;<b>&#55;&#x37;4120</b></p>',
      code: '774120',
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(extract(c.subject, c.text, c.html).code).toBe(c.code);
    });
  }
});

describe('验证链接提取', () => {
  it('Discord 验证链接', () => {
    const r = extract(
      'Verify Email Address for Discord',
      'Hey there,\nThanks for registering. Before we get started, verify your email:\n' +
        'https://click.discord.com/ls/click?upn=abc https://discord.com/verify?token=abc.def-123\n\nNeed help? https://support.discord.com',
      undefined,
    );
    expect(r.link).toBe('https://discord.com/verify?token=abc.def-123');
    expect(r.code).toBeNull();
  });

  it('HTML 中 href 的 confirm 链接，解码 &amp;', () => {
    const r = extract('Confirm', undefined, '<a href="https://example.org/account/confirm?u=1&amp;t=xyz">Confirm</a>');
    expect(r.link).toBe('https://example.org/account/confirm?u=1&t=xyz');
  });

  it('activate 链接去掉结尾标点', () => {
    const r = extract('Welcome', 'Activate here: https://app.test/activate/QWE123.', undefined);
    expect(r.link).toBe('https://app.test/activate/QWE123');
  });

  it('跳过退订链接，查询参数里的关键词低于路径里的', () => {
    expect(
      findLink(
        'https://news.test/unsubscribe?confirm=1 https://t.test/c?redirect=confirm https://app.test/email/verify/abc',
      ),
    ).toBe('https://app.test/email/verify/abc');
    expect(findLink('https://t.test/c?step=confirm')).toBe('https://t.test/c?step=confirm');
  });

  it('没有相关链接时为空', () => {
    expect(extract('Hi', 'See https://example.com/blog for news', undefined).link).toBeNull();
  });

  it('URL 中的数字不会被当作验证码', () => {
    expect(findCode('verify https://x.test/verify?id=883321'.replace(/https?:\/\/\S+/, ' '))).toBeNull();
  });
});

describe('htmlToText', () => {
  it('跳过 style/script/head，块级标签换行', () => {
    const t = htmlToText('<head><title>T</title></head><style>p{}</style><p>a</p><script>x()</script><div>b<br>c</div>');
    expect(t).not.toMatch(/p\{|x\(|T/);
    expect(t).toContain('a\n');
    expect(t).toContain('b\nc');
  });

  it('未闭合的 style 只跳过开标签', () => {
    expect(htmlToText('<style>code 123456')).toContain('code 123456');
  });

  it('href 中的实体只解码一次', () => {
    expect(htmlToText('<a href="https://x.test/?a=1&amp;amp;b=2">x</a>')).toContain('https://x.test/?a=1&amp;b=2');
  });

  it('不成对的尖括号按文本保留', () => {
    expect(htmlToText('a < b and 5 > 3')).toContain('a < b and 5 > 3');
    expect(htmlToText('x <<<')).toBe('x <<<');
  });

  it('decodeEntities', () => {
    expect(decodeEntities('&lt;&#65;&#x42;&unknown;&#xD800;')).toBe('<AB&unknown;&#xD800;');
  });
});

describe('性能', () => {
  // 旧实现中这些输入会触发二次方回溯：64KB 的 '<' 约 2.5 秒
  it.each([
    ['64KB 的 <', '<'.repeat(64 * 1024)],
    ['大量无 > 的 <a', '<a '.repeat(21_000)],
    ['大量未闭合 <style>', '<style>'.repeat(9_000)],
    ['大量未闭合注释', '<!--'.repeat(16_000)],
    ['大量 </ 和属性', '<a href="'.repeat(7_000)],
  ])('对抗性输入：%s 远低于 10ms', (_, html) => {
    const start = performance.now();
    extract('subject', undefined, html);
    expect(performance.now() - start).toBeLessThan(10);
  });

  it('5KB 输入的提取远低于 10ms', () => {
    const big = ('lorem ipsum code dolor 12ab sit amet verification '.repeat(200) + '验证码 123456').repeat(5);
    const html = `<div>${big}</div>`.repeat(20);
    const start = performance.now();
    for (let i = 0; i < 100; i++) extract('subject', big, html);
    expect((performance.now() - start) / 100).toBeLessThan(2);
  });

  it('htmlToText 保留链接', () => {
    expect(htmlToText('<a href="https://a.test/verify">x</a>')).toContain('https://a.test/verify');
  });
});
