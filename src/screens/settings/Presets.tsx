import { useEffect, useState } from 'react';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ConfirmSheet, Sheet } from '../../components/ui';
import { useT } from '../../i18n';
import { DEFAULT_PRESETS, newId, useSettings, type TempPreset } from '../../store';

// Preheat presets: list, edit sheet (temperatures and price per kg) and currency.

export function PresetSheet({
  preset,
  onClose,
  onSave,
}: {
  preset: TempPreset | null;
  onClose: () => void;
  onSave: (p: TempPreset) => void;
}) {
  const t = useT();
  const [form, setForm] = useState({ name: '', nozzle: '', bed: '', price: '' });
  useEffect(() => {
    if (preset)
      setForm({
        name: preset.name,
        nozzle: String(preset.nozzle),
        bed: String(preset.bed),
        price: preset.price ? String(preset.price) : '',
      });
  }, [preset]);
  const price = Number(form.price.replace(',', '.'));
  const nozzle = Number(form.nozzle);
  const bed = Number(form.bed);
  const valid =
    form.name.trim() !== '' &&
    form.nozzle !== '' &&
    form.bed !== '' &&
    nozzle >= 0 &&
    nozzle <= 350 &&
    bed >= 0 &&
    bed <= 150 &&
    (form.price === '' || price >= 0);
  return (
    <Sheet open={!!preset} onClose={onClose} title={t('settings.preset')}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (preset && valid)
            onSave({
              id: preset.id,
              name: form.name.trim(),
              nozzle,
              bed,
              ...(price > 0 ? { price } : {}),
            });
        }}
      >
        <label className="field">
          <span>{t('settings.presetName')}</span>
          <input
            className="input"
            value={form.name}
            placeholder="PLA"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <div className="row gap">
          <label className="field grow">
            <span>{t('settings.nozzleTemp')}</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={form.nozzle}
              onChange={(e) => setForm({ ...form, nozzle: e.target.value })}
            />
          </label>
          <label className="field grow">
            <span>{t('settings.bedTemp')}</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={form.bed}
              onChange={(e) => setForm({ ...form, bed: e.target.value })}
            />
          </label>
        </div>
        <label className="field">
          <span>{t('settings.presetPrice')}</span>
          <input
            className="input"
            type="text"
            inputMode="decimal"
            value={form.price}
            placeholder={t('settings.presetPriceHint')}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
        </label>
        <div className="row gap">
          <button type="button" className="btn grow" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn primary grow" disabled={!valid}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function PresetsEditor() {
  const t = useT();
  const { settings, updateSettings } = useSettings();
  const [editing, setEditing] = useState<TempPreset | null>(null);
  const [deleting, setDeleting] = useState<TempPreset | null>(null);
  const presets = settings.presets;
  return (
    <div className="field">
      <small className="muted">{t('settings.presetsHint')}</small>
      {presets.map((p) => (
        <div key={p.id} className="preset-row">
          <span className="grow">
            <strong>{p.name}</strong>
            <small className="muted">
              {t('home.nozzle')} {p.nozzle}° · {t('home.bed')} {p.bed}°
              {p.price ? ` · ${settings.currency}${p.price}/kg` : ''}
            </small>
          </span>
          <button
            type="button"
            className="btn icon ghost"
            onClick={() => setEditing(p)}
            aria-label={t('settings.edit')}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className="btn icon ghost"
            onClick={() => setDeleting(p)}
            aria-label={t('common.delete')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <div className="row gap">
        <button
          type="button"
          className="btn grow"
          onClick={() => setEditing({ id: newId(), name: '', nozzle: 210, bed: 60 })}
        >
          <Plus size={18} /> {t('settings.addPreset')}
        </button>
        <button
          type="button"
          className="btn icon"
          onClick={() => updateSettings({ presets: DEFAULT_PRESETS })}
          aria-label={t('settings.resetPresets')}
          title={t('settings.resetPresets')}
        >
          <RotateCcw size={18} />
        </button>
      </div>
      <label className="field">
        <span>{t('settings.currency')}</span>
        <input
          className="input"
          value={settings.currency}
          maxLength={4}
          onChange={(e) => updateSettings({ currency: e.target.value })}
        />
      </label>
      <PresetSheet
        preset={editing}
        onClose={() => setEditing(null)}
        onSave={(p) => {
          const exists = presets.some((x) => x.id === p.id);
          updateSettings({
            presets: exists ? presets.map((x) => (x.id === p.id ? p : x)) : [...presets, p],
          });
          setEditing(null);
        }}
      />
      <ConfirmSheet
        open={!!deleting}
        title={t('settings.deletePreset', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() =>
          deleting && updateSettings({ presets: presets.filter((x) => x.id !== deleting.id) })
        }
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
