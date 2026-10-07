import { Theme } from '@radix-ui/themes';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AddressBar } from './components/AddressBar';
import { MailList } from './components/MailList';
import { MailView } from './components/MailView';
import { TopBar } from './components/TopBar';
import { fetchConfig, type AppConfig } from './lib/api';
import { randomPrefix } from './lib/random';
import { load, save } from './lib/storage';
import { useInbox } from './lib/useInbox';
import { checkPrefix } from '../shared/address';

type Appearance = 'light' | 'dark';
const ADDRESS_KEY = 'qf.address';
const THEME_KEY = 'qf.theme';

function initialAppearance(): Appearance {
  const saved = load(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function App() {
  const [appearance, setAppearance] = useState<Appearance>(initialAppearance);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.style.colorScheme = appearance;
  }, [appearance]);

  useEffect(() => {
    fetchConfig()
      .then((c) => {
        setConfig(c);
        const saved = load(ADDRESS_KEY);
        const savedPrefix = saved?.endsWith(`@${c.domain}`) ? saved.slice(0, -c.domain.length - 1) : null;
        const valid = savedPrefix && checkPrefix(savedPrefix, c.reserved) === null;
        const p = valid ? savedPrefix : randomPrefix();
        setPrefix(p);
        save(ADDRESS_KEY, `${p}@${c.domain}`);
      })
      .catch(() => setConfigError(true));
  }, []);

  const address = config && prefix ? `${prefix}@${config.domain}` : null;
  const inbox = useInbox(address, config?.pollSeconds ?? 10);

  const changePrefix = useCallback(
    (p: string) => {
      if (!config) return;
      setPrefix(p);
      setSelectedId(null);
      save(ADDRESS_KEY, `${p}@${config.domain}`);
    },
    [config],
  );

  const toggleAppearance = () => {
    const next = appearance === 'dark' ? 'light' : 'dark';
    setAppearance(next);
    save(THEME_KEY, next);
  };

  const selected = useMemo(
    () => inbox.messages.find((m) => m.id === selectedId) ?? null,
    [inbox.messages, selectedId],
  );

  return (
    <Theme appearance={appearance} accentColor="indigo" grayColor="slate" radius="medium" scaling="100%">
      <div className="app">
        <TopBar appearance={appearance} onToggleAppearance={toggleAppearance} />
        <AddressBar
          config={config}
          configError={configError}
          address={address}
          prefix={prefix}
          onChange={changePrefix}
          onNew={() => changePrefix(randomPrefix())}
        />
        <main className={`panes${selected ? ' has-selection' : ''}`}>
          <section className="pane pane-list" aria-label="收件列表">
            <MailList
              address={address}
              messages={inbox.messages}
              status={inbox.status}
              checkedAt={inbox.checkedAt}
              selectedId={selectedId}
              retentionHours={config?.retentionHours ?? 24}
              onSelect={setSelectedId}
              onRefresh={inbox.refresh}
            />
          </section>
          <section className="pane pane-detail" aria-label="邮件内容">
            <MailView address={address} summary={selected} onBack={() => setSelectedId(null)} />
          </section>
        </main>
      </div>
    </Theme>
  );
}
