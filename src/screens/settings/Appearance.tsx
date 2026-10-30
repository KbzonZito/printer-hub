import { Check, Monitor, Moon, Smartphone, Sun } from 'lucide-react';
import { Select } from '../../components/ui';
import {
  DEFAULT_SEED,
  PALETTE_STYLES,
  previewColors,
  SEED_PRESETS,
  useSeedColor,
  useSystemColor,
} from '../../palette';
import { useT, type MessageKey } from '../../i18n';
import { useSettings, type Theme } from '../../store';

// Appearance settings: language, theme, palette color and style (also used by the welcome wizard).

export const THEMES: { id: Theme; key: MessageKey; icon: typeof Sun }[] = [
  { id: 'system', key: 'settings.themeSystem', icon: Monitor },
  { id: 'light', key: 'settings.themeLight', icon: Sun },
  { id: 'dark', key: 'settings.themeDark', icon: Moon },
];

export function PaletteDots({ colors }: { colors: string[] }) {
  return (
    <span className="palette-dots">
      {colors.map((c, i) => (
        <span key={i} style={{ background: c }} />
      ))}
    </span>
  );
}

export function ColorPicker() {
  const t = useT();
  const { settings, updateSettings } = useSettings();
  const system = useSystemColor();
  const seed = useSeedColor(settings);
  const dark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const selected = settings.color === 'device' && !system ? DEFAULT_SEED : settings.color;
  const swatches = [...(system ? ['device'] : []), ...SEED_PRESETS];
  return (
    <>
      <div className="field">
        <span>{t('settings.color')}</span>
        <div className="swatches" role="radiogroup">
          {swatches.map((c) => {
            const color = c === 'device' ? system! : c;
            return (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={selected === c}
                aria-label={c === 'device' ? t('settings.colorDevice') : c}
                title={c === 'device' ? t('settings.colorDevice') : undefined}
                className={`swatch ${selected === c ? 'active' : ''}`}
                onClick={() => updateSettings({ color: c })}
              >
                <PaletteDots colors={previewColors(color, settings.paletteStyle, dark)} />
                {selected === c ? <Check size={18} /> : c === 'device' && <Smartphone size={16} />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="field">
        <span>{t('settings.paletteStyle')}</span>
        <Select
          title={t('settings.paletteStyle')}
          value={settings.paletteStyle}
          onChange={(paletteStyle) => updateSettings({ paletteStyle })}
          options={PALETTE_STYLES.map((s) => ({
            value: s,
            label: t(`palette.${s}` as MessageKey),
            extra: <PaletteDots colors={previewColors(seed, s, dark)} />,
          }))}
        />
      </div>
    </>
  );
}

/** Language, theme and colors; also shown during onboarding. */
export function AppearancePrefs() {
  const t = useT();
  const { settings, updateSettings } = useSettings();
  return (
    <div className="form">
      <div className="field">
        <span>{t('settings.language')}</span>
        <div className="segmented">
          {(['es', 'en'] as const).map((l) => (
            <button
              type="button"
              key={l}
              className={settings.lang === l ? 'active' : ''}
              onClick={() => updateSettings({ lang: l })}
            >
              {l === 'es' ? 'Español' : 'English'}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>{t('settings.theme')}</span>
        <div className="segmented">
          {THEMES.map(({ id, key, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={settings.theme === id ? 'active' : ''}
              onClick={() => updateSettings({ theme: id })}
            >
              <Icon size={15} /> {t(key)}
            </button>
          ))}
        </div>
      </div>
      <ColorPicker />
    </div>
  );
}
