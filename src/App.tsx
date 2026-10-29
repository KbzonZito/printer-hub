import { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import {
  FileUp,
  FolderOpen,
  Gauge,
  LayoutGrid,
  Move,
  Printer as PrinterIcon,
  Settings,
} from 'lucide-react';
import { uploadFile } from './api/moonraker';
import { handleBack, useBackHandler } from './backStack';
import { pruneModels } from './gcode/cache';
import { ConnectionBanner, KlippyStateScreen } from './components/ConnectionStatus';
import { EmergencyStop } from './components/EmergencyStop';
import { NavBar } from './components/NavBar';
import { Sheet, ToastProvider, useAction } from './components/ui';
import { formatBytes } from './format';
import { useT, type MessageKey } from './i18n';
import { readSharedFile, type SharedFile } from './native';
import { applyPalette, useSeedColor } from './palette';
import { ControlScreen } from './screens/ControlScreen';
import { Dashboard } from './screens/Dashboard';
import { FilesScreen } from './screens/FilesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AllPrinters } from './screens/AllPrinters';
import { Wizard } from './onboarding/Wizard';
import { useSettings, useStore, type Printer, type Settings as AppSettings } from './store';
import { useNativeSync, useSharedFiles } from './useNativeBridge';
import { ConnectionProvider } from './connection/ConnectionProvider';
import { useConnectionSnapshot } from './usePrinterStatus';

type Tab = 'home' | 'control' | 'files' | 'settings';

const TABS: { id: Tab; icon: typeof Gauge }[] = [
  { id: 'home', icon: Gauge },
  { id: 'control', icon: Move },
  { id: 'files', icon: FolderOpen },
  { id: 'settings', icon: Settings },
];

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/** Applies the theme to the page and keeps the Android status bar in sync. */
function useTheme(settings: AppSettings) {
  const { theme, paletteStyle } = settings;
  const seed = useSeedColor(settings);
  const [systemDark, setSystemDark] = useState(darkQuery.matches);
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    darkQuery.addEventListener('change', onChange);
    return () => darkQuery.removeEventListener('change', onChange);
  }, []);

  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    applyPalette(seed, paletteStyle);
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
      StatusBar.setBackgroundColor({ color: bg }).catch(() => {});
    }
  }, [theme, dark, seed, paletteStyle]);
}

function SharedFileSheet({
  file,
  printer,
  onClose,
  onPrinted,
}: {
  file: SharedFile | null;
  printer: Printer;
  onClose: () => void;
  onPrinted: () => void;
}) {
  const t = useT();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const upload = async (print: boolean) => {
    if (!file) return;
    setBusy(true);
    const ok = await run(
      async () => uploadFile(printer, await readSharedFile(file), print),
      t('files.uploaded', { name: file.name ?? '' }),
    );
    setBusy(false);
    if (ok) {
      onClose();
      if (print) onPrinted();
    }
  };
  return (
    <Sheet open={!!file} onClose={() => !busy && onClose()} title={t('share.title')}>
      {file && (
        <>
          <div className="shared-file">
            <FileUp size={22} className="accent" />
            <div className="file-info">
              <span className="file-name">{file.name}</span>
              <span className="muted small">
                {formatBytes(file.size ?? 0)} → {printer.name}
              </span>
            </div>
          </div>
          {busy ? (
            <div className="row gap center-v">
              <div className="loader small" />
              <span className="muted">{t('share.uploading')}</span>
            </div>
          ) : (
            <div className="row gap">
              <button className="btn grow" onClick={() => upload(false)}>
                {t('share.upload')}
              </button>
              <button className="btn primary grow" onClick={() => upload(true)}>
                <PrinterIcon size={18} /> {t('share.uploadPrint')}
              </button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

function Onboarding({ firstRun }: { firstRun: boolean }) {
  const { updateSettings } = useSettings();
  return (
    <div className="app">
      <main>
        <div className="screen onboarding">
          <Wizard
            mode={firstRun ? 'full' : 'printer'}
            onDone={() => updateSettings({ onboarded: true })}
          />
        </div>
      </main>
    </div>
  );
}

/** Android back button (and Escape in the browser): the newest open thing first, then leave. */
function useBackButton() {
  useEffect(() => {
    const sub = CapApp.addListener('backButton', () => {
      if (!handleBack()) CapApp.exitApp();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleBack();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      sub.then((s) => s.remove());
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}

export default function App() {
  const { settings } = useSettings();
  const { active } = useStore();
  useTheme(settings);
  useBackButton();

  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);

  // Old G-code previews go away by themselves (Settings → Storage).
  useEffect(() => {
    if (settings.previewCacheDays > 0) pruneModels(settings.previewCacheDays * 86_400_000);
  }, [settings.previewCacheDays]);

  if (!settings.onboarded || !active) {
    return (
      <ToastProvider>
        <Onboarding firstRun={!settings.onboarded} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <ConnectionProvider printer={active}>
        <Main active={active} />
      </ConnectionProvider>
    </ToastProvider>
  );
}

function Main({ active }: { active: Printer }) {
  const t = useT();
  const { settings } = useSettings();
  const { printers } = useStore();
  const [tab, setTab] = useState<Tab>('home');
  // Every printer at a glance (only with more than one); it replaces the current tab.
  const [overview, setOverview] = useState(false);
  const many = printers.length > 1;
  const snapshot = useConnectionSnapshot();
  const st = snapshot.status;
  useNativeSync(active, st, settings);
  const [sharedFile, clearSharedFile] = useSharedFiles();

  // Back from another tab returns to Home before leaving the app.
  useBackHandler(tab !== 'home', () => setTab('home'));
  useBackHandler(overview, () => setOverview(false));

  const kind = snapshot.state.kind;
  const klippyProblem = kind === 'klippy';
  const dotClass = kind === 'ready' ? 'ok' : kind === 'reconnecting' ? 'off' : 'warn';

  return (
    <>
      <div className="app">
        <NavBar
          tabs={TABS}
          active={tab}
          onSelect={(id) => {
            setOverview(false);
            setTab(id);
          }}
          label={(id) => t(`tab.${id}` as MessageKey)}
        />

        <div className="content">
          <header className="topbar">
            <button
              type="button"
              className="topbar-title"
              disabled={!many}
              onClick={() => setOverview(!overview)}
              aria-label={many ? t('printers.open') : undefined}
            >
              <h1>
                {overview ? t('printers.title') : active.name}
                {many && <LayoutGrid size={20} className="topbar-title-icon" />}
              </h1>
              <span className="muted small">
                {overview ? (
                  t('printers.count', { n: printers.length })
                ) : (
                  <>
                    <span className={`dot ${dotClass}`} />
                    {kind === 'reconnecting' ? t('common.disconnected') : active.host}
                  </>
                )}
              </span>
            </button>
            <div className="topbar-actions">
              {kind === 'ready' && st?.state === 'printing' && (
                <span className="topbar-progress">{Math.round(st.progress * 100)}%</span>
              )}
              <EmergencyStop printer={active} />
            </div>
          </header>

          <ConnectionBanner />

          <main key={overview ? 'all' : active.id}>
            {overview && (
              <AllPrinters
                onOpen={() => {
                  setOverview(false);
                  setTab('home');
                }}
              />
            )}
            {!overview && klippyProblem && (tab === 'home' || tab === 'control') && (
              <KlippyStateScreen printer={active} />
            )}
            {!overview && tab === 'home' && !klippyProblem && <Dashboard printer={active} />}
            {!overview && tab === 'control' && !klippyProblem && <ControlScreen printer={active} />}
            {!overview && tab === 'files' && (
              <FilesScreen printer={active} onPrintStarted={() => setTab('home')} />
            )}
            {!overview && tab === 'settings' && <SettingsScreen />}
          </main>
        </div>
      </div>
      <SharedFileSheet
        file={sharedFile}
        printer={active}
        onClose={clearSharedFile}
        onPrinted={() => setTab('home')}
      />
    </>
  );
}
