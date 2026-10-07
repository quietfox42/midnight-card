import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { checkPrefix } from '../shared/address';
import { ActionDock } from './components/ActionDock';
import { MidnightCard, type CardFx } from './components/card/MidnightCard';
import { ChevronIcon } from './components/Icons';
import { Inbox } from './components/Inbox';
import { MailDetail } from './components/MailDetail';
import { PrefixSheet } from './components/PrefixSheet';
import { Toast } from './components/Toast';
import { fetchConfig, type AppConfig } from './lib/api';
import { randomPrefix } from './lib/random';
import { load, save } from './lib/storage';
import { BRAND, T } from './lib/text';
import { useCopy } from './lib/useCopy';
import { useInbox } from './lib/useInbox';

const ADDRESS_KEY = 'mc.address';
const WIDE_QUERY = '(min-width: 900px)';
const HISTORY_MARK = 'mc-mail';

/** 宽屏双栏；窄屏时详情是滑入的全屏页 */
function useIsWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, copy] = useCopy();
  const wide = useIsWide();
  const listScrollY = useRef(0);
  const cardRef = useRef<CardFx>(null);

  useEffect(() => {
    fetchConfig()
      .then((c) => {
        setConfig(c);
        const saved = load(ADDRESS_KEY);
        const savedPrefix = saved?.endsWith(`@${c.domain}`) ? saved.slice(0, -c.domain.length - 1) : null;
        const p = savedPrefix && checkPrefix(savedPrefix, c.reserved) === null ? savedPrefix : randomPrefix();
        setPrefix(p);
        save(ADDRESS_KEY, `${p}@${c.domain}`);
      })
      .catch(() => setConfigError(true));
  }, []);

  const address = config && prefix ? `${prefix}@${config.domain}` : null;
  const inbox = useInbox(address, config?.pollSeconds ?? 10);
  const selected = useMemo(
    () => inbox.messages.find((m) => m.id === selectedId) ?? null,
    [inbox.messages, selectedId],
  );

  // ---------- 列表 ↔ 详情 ----------
  const overlay = detailOpen && !wide; // 窄屏全屏详情是否覆盖在列表之上

  const openMail = (id: number) => {
    setSelectedId(id);
    if (wide) return;
    listScrollY.current = window.scrollY;
    setDetailOpen(true);
    // 记一条历史，让手机的系统返回手势回到列表而不是离开页面
    if (history.state?.[HISTORY_MARK] !== true) history.pushState({ [HISTORY_MARK]: true }, '');
  };

  const closeMail = useCallback(() => {
    if (history.state?.[HISTORY_MARK] === true) history.back(); // 由 popstate 收尾
    else setDetailOpen(false);
  }, []);

  useEffect(() => {
    const onPop = () => setDetailOpen(false);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // 全屏详情打开时锁住背后的列表；关闭后恢复滚动位置，并把焦点还给刚才那封邮件
  useEffect(() => {
    if (!overlay) return;
    const root = document.documentElement;
    root.classList.add('is-locked');
    return () => {
      root.classList.remove('is-locked');
      window.scrollTo(0, listScrollY.current);
      if (selectedId != null) {
        document.querySelector<HTMLElement>(`[data-mail-id="${selectedId}"]`)?.focus({ preventScroll: true });
      }
    };
  }, [overlay, selectedId]);

  // ---------- 地址 ----------
  const changePrefix = useCallback(
    (p: string) => {
      if (!config) return;
      setPrefix(p);
      setSelectedId(null);
      setDetailOpen(false);
      save(ADDRESS_KEY, `${p}@${config.domain}`);
    },
    [config],
  );

  const copyAddress = async () => {
    if (address && (await copy(address, 'address'))) cardRef.current?.pulse();
  };

  const onArrive = useCallback(() => cardRef.current?.deliver(), []);

  if (configError) {
    return (
      <div className="shell">
        <TopBar />
        <main className="fatal" role="alert">
          <h1 className="fatal-title">{T.serverErrorTitle}</h1>
          <p className="fatal-body">{T.serverErrorBody}</p>
          <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
            {T.reload}
          </button>
        </main>
        <Toast />
      </div>
    );
  }

  const hours = config?.retentionHours ?? 24;

  return (
    <div className="shell">
      <div className="page" inert={overlay}>
        <TopBar />
        <main className="layout">
          <div className="column-main">
            <section className="hero" aria-label={T.addressLabel}>
              <MidnightCard
                ref={cardRef}
                prefix={prefix}
                domain={config?.domain ?? null}
                hours={hours}
                onCopy={copyAddress}
              />
              <ActionDock
                disabled={!address}
                copied={copied === 'address'}
                onCopy={copyAddress}
                onRenew={() => changePrefix(randomPrefix())}
                onCustomize={() => setSheetOpen(true)}
              />
              <details className="notice">
                <summary>
                  <span className="notice-dot" aria-hidden="true" />
                  {T.noticeSummary(hours)}
                  <ChevronIcon />
                </summary>
                <p>{T.publicNotice(hours)}</p>
              </details>
            </section>

            <Inbox
              ready={!!address}
              messages={inbox.messages}
              status={inbox.status}
              checkedAt={inbox.checkedAt}
              selectedId={wide ? selectedId : null}
              copied={copied}
              onCopy={copy}
              onOpen={openMail}
              onRefresh={inbox.refresh}
              onArrive={onArrive}
            />
          </div>

          {wide && (
            <MailDetail
              variant="pane"
              address={address}
              summary={selected}
              open={false}
              copied={copied}
              onCopy={copy}
              onBack={closeMail}
            />
          )}
        </main>
      </div>

      {!wide && (
        <MailDetail
          variant="overlay"
          address={address}
          summary={selected}
          open={detailOpen}
          copied={copied}
          onCopy={copy}
          onBack={closeMail}
        />
      )}

      {config && prefix && (
        <PrefixSheet
          open={sheetOpen}
          domain={config.domain}
          current={prefix}
          reserved={config.reserved}
          onClose={() => setSheetOpen(false)}
          onSubmit={(p) => {
            changePrefix(p);
            setSheetOpen(false);
          }}
        />
      )}
      <Toast />
    </div>
  );
}

function TopBar() {
  return (
    <header className="topbar">
      <span className="brand">
        <img src="/favicon.svg" width="24" height="24" alt="" />
        <span className="brand-name">{BRAND}</span>
      </span>
      <span className="brand-sub">临时邮箱</span>
    </header>
  );
}
