import { useEffect, useState, type CSSProperties } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import {
  Camera,
  FileUp,
  FolderOpen,
  Gauge,
  Move,
  Printer as PrinterIcon,
  Settings,
} from 'lucide-react';
import { uploadFile } from './api/moonraker';
import { Sheet, ToastProvider, useAction } from './components/ui';
import { formatBytes } from './format';
import { useT, type MessageKey } from './i18n';
import { readSharedFile, type SharedFile } from './native';
import { applyPalette, useSeedColor } from './palette';
import { CameraScreen } from './screens/CameraScreen';
import { ControlScreen } from './screens/ControlScreen';
import { Dashboard } from './screens/Dashboard';
import { FilesScreen } from './screens/FilesScreen';
import { AppPreferences, PrinterForm, SettingsScreen } from './screens/SettingsScreen';
import { newPrinter, useSettings, useStore, type Printer, type Settings as AppSettings } from './store';
import { useNativeSync, useSharedFiles } from './useNativeBridge';
import { StatusContext, usePrinterStatusPoll } from './usePrinterStatus';

type Tab = 'home' | 'camera' | 'control' | 'files' | 'settings';

const TABS: { id: Tab; icon: typeof Gauge }[] = [
  { id: 'home', icon: Gauge },
  { id: 'camera', icon: Camera },
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

function Onboarding() {
  const t = useT();
  const { savePrinter } = useStore();
  return (
    <div className="app">
      <main>
        <div className="screen onboarding">
          <div className="brand-mark">
            <img src="./icon.svg" alt="" width={64} height={64} />
          </div>
          <h1>Printer Hub</h1>
          <p className="muted">{t('onboarding.text')}</p>
          <AppPreferences compact />
          <PrinterForm initial={newPrinter()} onSave={savePrinter} />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const t = useT();
  const { settings } = useSettings();
  const { active, savePrinter } = useStore();
  const [tab, setTab] = useState<Tab>('home');
  const status = usePrinterStatusPoll(active);
  useTheme(settings);
  useNativeSync(active, status.status, settings);
  const [sharedFile, clearSharedFile] = useSharedFiles();

  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);

  // Android back button: return to the home tab before leaving the app.
  useEffect(() => {
    const sub = CapApp.addListener('backButton', () => {
      if (tab !== 'home') setTab('home');
      else CapApp.exitApp();
    });
    return () => {
      sub.then((s) => s.remove());
    };
  }, [tab]);

  if (!active) {
    return (
      <ToastProvider>
        <Onboarding />
      </ToastProvider>
    );
  }

  const st = status.status;
  const dotClass = status.connected ? (st?.klippyState === 'ready' ? 'ok' : 'warn') : 'off';

  return (
    <ToastProvider>
      <StatusContext.Provider value={status}>
        <div className="app">
          <nav className="tabbar">
            <img className="rail-logo" src="./icon.svg" alt="" width={40} height={40} />
            <span
              className="tab-indicator"
              style={{ '--i': TABS.findIndex((x) => x.id === tab) } as CSSProperties}
            />
            {TABS.map(({ id, icon: Icon }) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                <Icon size={22} />
                <span>{t(`tab.${id}` as MessageKey)}</span>
              </button>
            ))}
          </nav>

          <div className="content">
            <header className="topbar">
              <div>
                <h1>{active.name}</h1>
                <span className="muted small">
                  <span className={`dot ${dotClass}`} />
                  {status.connected ? active.host : t('common.disconnected')}
                </span>
              </div>
              {st?.state === 'printing' && (
                <span className="topbar-progress">{Math.round(st.progress * 100)}%</span>
              )}
            </header>

            <main key={active.id}>
              {tab === 'home' && (
                <Dashboard printer={active} onOpenCamera={() => setTab('camera')} />
              )}
              {tab === 'camera' && (
                <CameraScreen
                  printer={active}
                  onModeChange={(cameraMode) => savePrinter({ ...active, cameraMode })}
                />
              )}
              {tab === 'control' && <ControlScreen printer={active} />}
              {tab === 'files' && (
                <FilesScreen printer={active} onPrintStarted={() => setTab('home')} />
              )}
              {tab === 'settings' && <SettingsScreen />}
            </main>
          </div>
        </div>
        <SharedFileSheet
          file={sharedFile}
          printer={active}
          onClose={clearSharedFile}
          onPrinted={() => setTab('home')}
        />
      </StatusContext.Provider>
    </ToastProvider>
  );
}
