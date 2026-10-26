import { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Camera, FolderOpen, Gauge, Settings } from 'lucide-react';
import { ToastProvider } from './components/ui';
import { CameraScreen } from './screens/CameraScreen';
import { Dashboard } from './screens/Dashboard';
import { FilesScreen } from './screens/FilesScreen';
import { PrinterForm, SettingsScreen } from './screens/SettingsScreen';
import { newPrinter, useStore } from './store';
import { StatusContext, usePrinterStatusPoll } from './usePrinterStatus';

type Tab = 'home' | 'camera' | 'files' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof Gauge }[] = [
  { id: 'home', label: 'Inicio', icon: Gauge },
  { id: 'camera', label: 'Cámara', icon: Camera },
  { id: 'files', label: 'Archivos', icon: FolderOpen },
  { id: 'settings', label: 'Ajustes', icon: Settings },
];

function Onboarding() {
  const { savePrinter } = useStore();
  return (
    <div className="app">
      <div className="screen onboarding">
        <div className="brand-mark">
          <img src="./icon.svg" alt="" width={64} height={64} />
        </div>
        <h1>Printer Hub</h1>
        <p className="muted">
          Conecta tu Creality Hi (o cualquier impresora con Klipper + Moonraker) introduciendo su IP
          local. La encuentras en la pantalla de la impresora, en Ajustes → Red.
        </p>
        <PrinterForm initial={newPrinter()} onSave={savePrinter} />
      </div>
    </div>
  );
}

export default function App() {
  const { active, savePrinter } = useStore();
  const [tab, setTab] = useState<Tab>('home');
  const status = usePrinterStatusPoll(active);

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
          <header className="topbar">
            <div>
              <h1>{active.name}</h1>
              <span className="muted small">
                <span className={`dot ${dotClass}`} />
                {status.connected ? active.host : 'Desconectada'}
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

          <nav className="tabbar">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                <Icon size={22} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </StatusContext.Provider>
    </ToastProvider>
  );
}
