import { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Camera, FolderOpen, Gauge, Settings } from 'lucide-react';
import { ToastProvider } from './components/ui';
import { useT, type MessageKey } from './i18n';
import { CameraScreen } from './screens/CameraScreen';
import { Dashboard } from './screens/Dashboard';
import { FilesScreen } from './screens/FilesScreen';
import { AppPreferences, PrinterForm, SettingsScreen } from './screens/SettingsScreen';
import { newPrinter, useSettings, useStore, type Theme } from './store';
import { StatusContext, usePrinterStatusPoll } from './usePrinterStatus';

type Tab = 'home' | 'camera' | 'files' | 'settings';

const TABS: { id: Tab; icon: typeof Gauge }[] = [
  { id: 'home', icon: Gauge },
  { id: 'camera', icon: Camera },
  { id: 'files', icon: FolderOpen },
  { id: 'settings', icon: Settings },
];

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/** Applies the theme to the page and keeps the Android status bar in sync. */
function useTheme(theme: Theme) {
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
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
      StatusBar.setBackgroundColor({ color: bg }).catch(() => {});
    }
  }, [theme, dark]);
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
  useTheme(settings.theme);

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
              {tab === 'home' && <Dashboard printer={active} onOpenCamera={() => setTab('camera')} />}
              {tab === 'camera' && (
                <CameraScreen
                  printer={active}
                  onModeChange={(cameraMode) => savePrinter({ ...active, cameraMode })}
                />
              )}
              {tab === 'files' && <FilesScreen printer={active} onPrintStarted={() => setTab('home')} />}
              {tab === 'settings' && <SettingsScreen />}
            </main>
          </div>
        </div>
      </StatusContext.Provider>
    </ToastProvider>
  );
}
