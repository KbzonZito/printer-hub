import {
  BookOpen,
  Check,
  FolderOpen,
  LayoutGrid,
  Palette,
  Server,
  Thermometer,
  Unlock,
  Wifi,
} from 'lucide-react';
import { useT } from '../i18n';
import { openExternal } from '../native';
import { AppearancePrefs } from '../screens/SettingsScreen';
import type { StepProps } from './Wizard';

export function AppearanceStep(_: StepProps) {
  const t = useT();
  return (
    <div className="wizard-page">
      <div className="wizard-icon">
        <Palette size={32} />
      </div>
      <h2>{t('settings.appearance')}</h2>
      <p className="muted">{t('wizard.appearance.text')}</p>
      <AppearancePrefs />
    </div>
  );
}

export function RequirementsStep(_: StepProps) {
  const t = useT();
  return (
    <div className="wizard-page">
      <div className="wizard-icon">
        <BookOpen size={32} />
      </div>
      <h2>{t('wizard.requirements.title')}</h2>
      <p className="muted">{t('wizard.requirements.text')}</p>
      <ul className="feature-list">
        <li>
          <Server size={20} /> {t('wizard.requirements.klipper')}
        </li>
        <li>
          <Wifi size={20} /> {t('wizard.requirements.wifi')}
        </li>
        <li>
          <Unlock size={20} /> {t('wizard.requirements.root')}
        </li>
      </ul>
      <button
        className="btn ghost"
        onClick={() => openExternal('https://github.com/KbzonZito/printer-hub#readme')}
      >
        {t('wizard.requirements.help')}
      </button>
    </div>
  );
}

export function DoneStep(_: StepProps) {
  const t = useT();
  return (
    <div className="wizard-page">
      <div className="wizard-icon ok">
        <Check size={32} />
      </div>
      <h2>{t('wizard.done.title')}</h2>
      <p className="muted">{t('wizard.done.text')}</p>
      <ul className="feature-list">
        <li>
          <Thermometer size={20} /> {t('wizard.done.tip1')}
        </li>
        <li>
          <FolderOpen size={20} /> {t('wizard.done.tip2')}
        </li>
        <li>
          <LayoutGrid size={20} /> {t('wizard.done.tip3')}
        </li>
      </ul>
    </div>
  );
}
