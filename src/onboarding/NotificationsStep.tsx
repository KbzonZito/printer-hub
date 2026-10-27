import { useState } from 'react';
import { Bell, BellOff, Check, CircleAlert, LayoutGrid, PartyPopper } from 'lucide-react';
import { useT } from '../i18n';
import { PrinterMonitor } from '../native';
import { useSettings } from '../store';
import type { StepProps } from './Wizard';

export function NotificationsStep(_: StepProps) {
  const t = useT();
  const { updateSettings } = useSettings();
  const [state, setState] = useState<'idle' | 'asking' | 'granted' | 'denied'>('idle');

  const enable = async () => {
    setState('asking');
    const { granted } = await PrinterMonitor.requestNotifications().catch(() => ({
      granted: false,
    }));
    updateSettings({ notify: granted });
    setState(granted ? 'granted' : 'denied');
  };

  return (
    <div className="wizard-page">
      <div className="wizard-icon">
        <Bell size={32} />
      </div>
      <h2>{t('wizard.notify.title')}</h2>
      <p className="muted">{t('wizard.notify.text')}</p>
      <ul className="feature-list">
        <li>
          <PartyPopper size={20} /> {t('wizard.notify.finish')}
        </li>
        <li>
          <CircleAlert size={20} /> {t('wizard.notify.problems')}
        </li>
        <li>
          <LayoutGrid size={20} /> {t('wizard.notify.widget')}
        </li>
      </ul>
      {state === 'granted' ? (
        <div className="banner ok">
          <Check size={18} /> {t('wizard.notify.granted')}
        </div>
      ) : state === 'denied' ? (
        <div className="banner error">
          <BellOff size={18} /> {t('wizard.notify.denied')}
        </div>
      ) : (
        <button className="btn tonal" onClick={enable} disabled={state === 'asking'}>
          <Bell size={18} /> {t('wizard.notify.enable')}
        </button>
      )}
      <small className="muted">{t('wizard.notify.later')}</small>
    </div>
  );
}
