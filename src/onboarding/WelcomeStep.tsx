import { ArrowRight } from 'lucide-react';
import { useT } from '../i18n';
import type { StepProps } from './Wizard';

export function WelcomeStep({ next }: StepProps) {
  const t = useT();
  return (
    <div className="welcome">
      <div className="welcome-art" aria-hidden="true">
        <span className="blob one" />
        <span className="blob two" />
        <span className="blob three" />
        <img src="./icon.svg" alt="" width={112} height={112} />
      </div>
      <h1>{t('welcome.title')}</h1>
      <p className="muted">{t('welcome.text')}</p>
      <ul className="welcome-points">
        <li>{t('welcome.point1')}</li>
        <li>{t('welcome.point2')}</li>
        <li>{t('welcome.point3')}</li>
      </ul>
      <button className="btn primary big" onClick={next}>
        {t('welcome.start')} <ArrowRight size={18} />
      </button>
    </div>
  );
}
