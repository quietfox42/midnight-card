import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { checkPrefix } from '../shared/address';
import { ActionDock } from './components/ActionDock';
import { MidnightCard, type CardFx } from './components/card/MidnightCard';
import { ArrowUpIcon } from './components/Icons';
import { Inbox } from './components/Inbox';
import { Toast } from './components/Toast';
import { fetchConfig, type AppConfig } from './lib/api';
import { lazy, whenIdle } from './lib/lazy';
import { haptic, prefersReducedMotion } from './lib/motion';
import { randomPrefix } from './lib/random';
import { load, save } from './lib/storage';
import { T } from './lib/text';
import { announce, useCopy } from './lib/useCopy';
import { useInbox } from './lib/useInbox';
import { usePullToRefresh } from './lib/usePullToRefresh';
import { useMediaQuery, WIDE_QUERY } from './lib/store';
import { addressKey, detailCodeKey } from './lib/copyKeys';

// 详情和自定义抽屉不在首屏：首屏渲染后空闲时预取，打开时已就绪
const MailDetail = lazy(() => import('./components/MailDetail').then((m) => m.MailDetail));
const PrefixSheet = lazy(() => import('./components/PrefixSheet').then((m) => m.PrefixSheet));

const ADDRESS_KEY = 'mc.address';
const HISTORY_MARK = 'mc-mail';
const PILL_MS = 6000;

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cardVisible, setCardVisible] = useState(true);
  const [pill, setPill] = useState(0); // 卡片不在屏幕上时到达的新邮件数
  const [copied, copy] = useCopy();
  const wide = useMediaQuery(WIDE_QUERY); // 宽屏双栏；窄屏时详情是从底部升起的全高面板
  const listScrollY = useRef(0);
  const cardRef = useRef<CardFx>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef<HTMLDivElement>(null);
  const ptrRef = useRef<HTMLDivElement>(null);
  const cardVisibleRef = useRef(true);
  cardVisibleRef.current = cardVisible;

  useEffect(() => {
    fetchConfig()
      .then((c) => {
        setConfig(c);
        const saved = load(ADDRESS_KEY);
        const savedPrefix = saved?.endsWith(`@${c.domain}`) ? saved.slice(0, -c.domain.length - 1) : null;
        const p = savedPrefix && checkPrefix(savedPrefix, c.reserved) === null ? savedPrefix : randomPrefix();
        setPrefix(p);
        save(ADDRESS_KEY, `${p}@${c.domain}`);
        whenIdle(() => {
          void MailDetail.preload().catch(() => {});
          void PrefixSheet.preload().catch(() => {});
        });
      })
      .catch(() => setConfigError(true));
  }, []);

  const address = config && prefix ? `${prefix}@${config.domain}` : null;
  const inbox = useInbox(address, config?.pollSeconds ?? 10);
  const selected = useMemo(
    () => inbox.messages.find((m) => m.id === selectedId) ?? null,
    [inbox.messages, selectedId],
  );

  const detailCopied = selectedId != null && copied === detailCodeKey(selectedId);

  // ---------- 列表 ↔ 详情 ----------
  const overlay = detailOpen && !wide; // 窄屏全高详情是否覆盖在列表之上

  // 下面的回调都要保持引用稳定：子组件是 memo 的，换新函数等于让它们全部重渲染
  const openMail = useCallback((id: number) => {
    setSelectedId(id);
    if (wide) return;
    listScrollY.current = window.scrollY;
    // 背后的页面以当前视口中心为原点后退
    if (pageRef.current) pageRef.current.style.transformOrigin = `50% ${window.scrollY + window.innerHeight / 2}px`;
    setDetailOpen(true);
    // 记一条历史，让手机的系统返回手势回到列表而不是离开页面
    if (history.state?.[HISTORY_MARK] !== true) history.pushState({ [HISTORY_MARK]: true }, '');
  }, [wide]);

  const closeMail = useCallback(() => {
    if (history.state?.[HISTORY_MARK] === true) history.back(); // 由 popstate 收尾
    else setDetailOpen(false);
  }, []);

  useEffect(() => {
    const onPop = () => setDetailOpen(false);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // 全高详情打开时锁住背后的列表；关闭后恢复滚动位置，并把焦点还给刚才那封邮件
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
      setPill(0);
      save(ADDRESS_KEY, `${p}@${config.domain}`);
      announce(T.newAddress(`${p}@${config.domain}`));
      // 新地址要被看见：卡片不在屏幕上时先滚回去再翻面
      if (!cardVisibleRef.current) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    },
    [config],
  );

  const copyAddress = useCallback(async () => {
    if (address && (await copy(address, addressKey))) cardRef.current?.pulse();
  }, [address, copy]);
  const renew = useCallback(() => changePrefix(randomPrefix()), [changePrefix]);
  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const submitPrefix = useCallback(
    (p: string) => {
      changePrefix(p);
      setSheetOpen(false);
    },
    [changePrefix],
  );

  // ---------- 新邮件 ----------
  const onArrive = useCallback((count: number) => {
    haptic([10, 50, 10]);
    cardRef.current?.deliver();
    if (!cardVisibleRef.current) setPill((n) => n + count);
  }, []);

  useEffect(() => {
    if (cardVisible) setPill(0);
  }, [cardVisible]);

  useEffect(() => {
    if (!pill) return;
    const t = window.setTimeout(() => setPill(0), PILL_MS);
    return () => window.clearTimeout(t);
  }, [pill]);

  const toTop = () => {
    setPill(0);
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  // ---------- 下拉刷新 ----------
  const refresh = inbox.refresh;
  const onPullRefresh = useCallback(() => {
    cardRef.current?.nod();
    return refresh();
  }, [refresh]);
  usePullToRefresh({ target: pullRef, indicator: ptrRef, onRefresh: onPullRefresh, enabled: !!address && !overlay && !sheetOpen && !wide });

  if (configError) {
    return (
      <div className="shell">
        <div className="fatal" role="alert">
          <h1 className="fatal-title">{T.serverErrorTitle}</h1>
          <p className="fatal-body">{T.serverErrorBody}</p>
          <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
            {T.reload}
          </button>
        </div>
        <Toast />
      </div>
    );
  }

  const hours = config?.retentionHours ?? 24;

  return (
    <div className="shell">
      <div className={`page${overlay ? ' is-receded' : ''}`} ref={pageRef} inert={overlay}>
        <h1 className="visually-hidden">午夜黑卡 · 临时邮箱</h1>
        <div className="ptr" ref={ptrRef} aria-hidden="true">
          <span className="ptr-ring" />
          <span className="ptr-label">
            <span className="ptr-pull">{T.pullHint}</span>
            <span className="ptr-armed">{T.pullRelease}</span>
            <span className="ptr-busy">{T.refreshing}</span>
          </span>
        </div>
        <main className="layout">
          <div className="column-main">
            <div className="pull-target" ref={pullRef}>
              <section className="hero" aria-label={T.addressLabel}>
                <MidnightCard
                  ref={cardRef}
                  prefix={prefix}
                  domain={config?.domain ?? null}
                  hours={hours}
                  onCopy={copyAddress}
                  onVisible={setCardVisible}
                />
              </section>

              <Inbox
                ready={!!address}
                messages={inbox.messages}
                status={inbox.status}
                checkedAt={inbox.checkedAt}
                selectedId={wide ? selectedId : null}
                copied={copied}
                onCopy={copy}
                onCopyAddress={copyAddress}
                onOpen={openMail}
                onRefresh={inbox.refresh}
                onArrive={onArrive}
              />
            </div>

            <ActionDock
              disabled={!address}
              copied={copied === addressKey}
              compact={!cardVisible && !wide}
              address={address}
              onCopy={copyAddress}
              onRenew={renew}
              onCustomize={openSheet}
            />
          </div>

          {wide && (
            <MailDetail
              variant="pane"
              address={address}
              summary={selected}
              open={false}
              copied={detailCopied}
              onCopy={copy}
              onBack={closeMail}
            />
          )}
        </main>
        <footer className="site-footer">
          <a href="https://icp.gov.moe/?keyword=20260768" target="_blank" rel="noopener noreferrer">
            萌ICP备20260768号
          </a>
        </footer>
      </div>

      {pill > 0 && !overlay && (
        <button type="button" className="new-pill" onClick={toTop}>
          <ArrowUpIcon />
          {T.newMail(pill)}
        </button>
      )}

      {!wide && (
        <MailDetail
          variant="overlay"
          address={address}
          summary={selected}
          open={detailOpen}
          copied={detailCopied}
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
          onClose={closeSheet}
          onSubmit={submitPrefix}
        />
      )}
      <Toast />
    </div>
  );
}
