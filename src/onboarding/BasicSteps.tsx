import { useT } from '../i18n';
import { AppearancePrefs } from '../screens/SettingsScreen';
import type { StepProps } from './Wizard';

// Simple steps, kept minimal for now (planned as "low" effort work in docs/ROADMAP.md).

export function AppearanceStep(_: StepProps) {
  const t = useT();
  return (
    <div className="wizard-page">
      <h2>{t('settings.appearance')}</h2>
      <AppearancePrefs />
    </div>
  );
}

export function RequirementsStep(_: StepProps) {
  const t = useT();
  return (
    <div className="wizard-page">
      <h2>{t('wizard.requirements.title')}</h2>
      <p className="muted">{t('onboarding.text')}</p>
    </div>
  );
}

export function DoneStep(_: StepProps) {
  const t = useT();
  return (
    <div className="wizard-page">
      <h2>{t('wizard.done.title')}</h2>
    </div>
  );
}
