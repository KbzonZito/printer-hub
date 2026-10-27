import { useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useBackHandler } from '../backStack';
import { useT } from '../i18n';
import { isNative } from '../native';
import { useStore } from '../store';
import { AppearanceStep, DoneStep, RequirementsStep } from './BasicSteps';
import { NotificationsStep } from './NotificationsStep';
import { PrinterStep } from './PrinterStep';
import { WelcomeStep } from './WelcomeStep';

export type StepId =
  'welcome' | 'appearance' | 'notifications' | 'requirements' | 'printer' | 'done';

/** What each step can do to the wizard around it. */
export interface StepProps {
  next: () => void;
  finish: () => void;
  /** Lets a step with its own sub-views handle "back" first; return true if it did. */
  onBack: (handler: (() => boolean) | null) => void;
}

const STEP_KEY = 'printer-hub:onboarding-step';

function savedStep(): number {
  try {
    return Number(localStorage.getItem(STEP_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveStep(i: number | null) {
  try {
    if (i == null) localStorage.removeItem(STEP_KEY);
    else localStorage.setItem(STEP_KEY, String(i));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Step-by-step setup. "full" is the first-run welcome (it remembers the step if the app is
 * closed half way); "printer" only adds a printer, from Settings.
 */
export function Wizard({
  mode,
  onDone,
  onCancel,
}: {
  mode: 'full' | 'printer';
  onDone: () => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const { printers } = useStore();
  const steps: StepId[] =
    mode === 'printer'
      ? ['requirements', 'printer']
      : [
          'welcome',
          'appearance',
          ...(isNative ? (['notifications'] as const) : []),
          'requirements',
          'printer',
          'done',
        ];
  const [index, setIndex] = useState(() =>
    mode === 'full' ? Math.min(savedStep(), steps.length - 1) : 0,
  );
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  const go = (i: number) => {
    setDirection(i > index ? 'forward' : 'back');
    setIndex(i);
    if (mode === 'full') saveStep(i);
  };
  const finish = () => {
    if (mode === 'full') saveStep(null);
    onDone();
  };
  const next = () => (index < steps.length - 1 ? go(index + 1) : finish());
  const stepBack = useRef<(() => boolean) | null>(null);
  const back = () => {
    if (stepBack.current?.()) return;
    if (index > 0) go(index - 1);
    else onCancel?.();
  };

  useBackHandler(index > 0 || !!onCancel, back);

  const step = steps[index];
  const props: StepProps = { next, finish, onBack: (h) => (stepBack.current = h) };
  const content: Record<StepId, ReactNode> = {
    welcome: <WelcomeStep {...props} />,
    appearance: <AppearanceStep {...props} />,
    notifications: <NotificationsStep {...props} />,
    requirements: <RequirementsStep {...props} />,
    printer: (
      <PrinterStep
        {...props}
        // Re-running the tutorial with printers already set up shouldn't force a new one.
        onSkip={mode === 'full' && printers.length > 0 ? next : undefined}
      />
    ),
    done: <DoneStep {...props} />,
  };
  // The welcome and printer steps have their own main button.
  const ownButton = step === 'welcome' || step === 'printer';

  return (
    <div className={`wizard ${mode}`}>
      <div className="wizard-top">
        {(index > 0 || onCancel) && step !== 'done' ? (
          <button className="btn icon ghost" onClick={back} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
        ) : (
          <span className="wizard-spacer" />
        )}
        {steps.length > 2 && (
          <div className="wizard-dots" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s} className={i === index ? 'active' : i < index ? 'done' : ''} />
            ))}
          </div>
        )}
        <span className="wizard-spacer" />
      </div>
      <div key={step} className={`wizard-step ${direction}`}>
        {content[step]}
      </div>
      {!ownButton && (
        <div className="wizard-footer">
          <button className="btn primary grow" onClick={next}>
            {step === 'done' ? t('wizard.start') : t('wizard.next')}
            {step !== 'done' && <ArrowRight size={18} />}
          </button>
        </div>
      )}
    </div>
  );
}
