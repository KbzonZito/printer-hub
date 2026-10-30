import { useState } from 'react';
import {
  Bell,
  Check,
  Clock,
  DatabaseBackup,
  GraduationCap,
  HardDrive,
  Info,
  Palette,
  Pencil,
  Plus,
  Printer as PrinterIcon,
  Thermometer,
  Trash2,
} from 'lucide-react';
import { Wizard } from '../onboarding/Wizard';
import { ConfirmSheet, Section, Sheet, useToast } from '../components/ui';
import { isNative } from '../native';
import { useT, type MessageKey } from '../i18n';
import { useSettings, useStore, type Printer } from '../store';

import { PrinterForm } from './settings/PrinterForm';
import { THEMES, AppearancePrefs } from './settings/Appearance';
import { PresetsEditor } from './settings/Presets';
import { EtaPref, NotifyPref, FirstLayerPref, StoragePrefs, BackupPrefs } from './settings/Prefs';
import { About } from './settings/About';

export function SettingsScreen() {
  const t = useT();
  const { settings, updateSettings } = useSettings();
  const { printers, active, savePrinter, removePrinter, selectPrinter } = useStore();
  const [editing, setEditing] = useState<Printer | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Printer | null>(null);
  const toast = useToast();
  const themeKey = THEMES.find((x) => x.id === settings.theme)!.key;

  return (
    <div className="screen settings settings-sections">
      <Section
        id="printers"
        icon={PrinterIcon}
        title={t('settings.printers')}
        summary={active ? `${active.name} · ${active.host}` : undefined}
        defaultOpen
      >
        <div className="list">
          {printers.map((p) => (
            <div key={p.id} className={`list-item ${active?.id === p.id ? 'selected' : ''}`}>
              <button className="list-main" onClick={() => selectPrinter(p.id)}>
                <PrinterIcon size={20} />
                <div>
                  <strong>{p.name}</strong>
                  <span className="muted small">
                    {p.host}:{p.port}
                  </span>
                </div>
                {active?.id === p.id && <Check size={18} className="accent" />}
              </button>
              <button
                className="btn icon ghost"
                onClick={() => setEditing(p)}
                aria-label={t('settings.edit')}
              >
                <Pencil size={16} />
              </button>
              <button
                className="btn icon ghost"
                onClick={() => setDeleting(p)}
                aria-label={t('common.delete')}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => setAdding(true)}>
          <Plus size={18} /> {t('settings.add')}
        </button>
      </Section>

      <Section
        id="appearance"
        icon={Palette}
        title={t('settings.appearance')}
        summary={`${settings.lang === 'es' ? 'Español' : 'English'} · ${t(themeKey)} · ${t(
          `palette.${settings.paletteStyle}` as MessageKey,
        )}`}
      >
        <AppearancePrefs />
      </Section>

      <Section
        id="temps"
        icon={Thermometer}
        title={t('settings.presets')}
        summary={settings.presets.map((p) => p.name).join(' · ')}
      >
        <PresetsEditor />
      </Section>

      <Section
        id="eta"
        icon={Clock}
        title={t('settings.etaTitle')}
        summary={t(`eta.${settings.eta}` as MessageKey)}
      >
        <EtaPref />
      </Section>

      {isNative && (
        <Section
          id="notify"
          icon={Bell}
          title={t('settings.notifications')}
          summary={settings.notify ? t('settings.on') : t('settings.off')}
        >
          <NotifyPref />
          <FirstLayerPref />
        </Section>
      )}

      <Section id="storage" icon={HardDrive} title={t('storage.title')}>
        <StoragePrefs />
      </Section>

      <Section id="backup" icon={DatabaseBackup} title={t('backup.title')}>
        <BackupPrefs />
      </Section>

      <Section id="about" icon={Info} title={t('settings.about')} summary="KbzonZito">
        <About printer={active} />
        <button className="btn" onClick={() => updateSettings({ onboarded: false })}>
          <GraduationCap size={18} /> {t('wizard.tutorial')}
        </button>
      </Section>

      <Sheet open={adding} onClose={() => setAdding(false)}>
        {adding && (
          <Wizard
            mode="printer"
            onCancel={() => setAdding(false)}
            onDone={() => {
              setAdding(false);
              toast(t('common.saved'));
            }}
          />
        )}
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t('settings.printer')}>
        {editing && (
          <PrinterForm
            key={editing.id}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(p) => {
              savePrinter(p);
              setEditing(null);
              toast(t('common.saved'));
            }}
          />
        )}
      </Sheet>
      <ConfirmSheet
        open={!!deleting}
        title={t('settings.deleteTitle', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => deleting && removePrinter(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
