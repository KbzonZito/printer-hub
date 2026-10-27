import { describe, expect, it } from 'vitest';
import { BackupError, backupJson, parseBackup } from './backup';
import { defaultSettings, type State } from './store';

const state: State = {
  printers: [
    { id: 'a', name: 'Hi', host: '192.168.1.177', port: 7125, cameraMode: 'auto', cameraUrl: '' },
    { id: 'b', name: 'K1', host: '192.168.1.50', port: 7125, cameraMode: 'mjpeg', cameraUrl: '' },
  ],
  activeId: 'b',
  settings: {
    ...defaultSettings(),
    color: '#3366ff',
    paletteStyle: 'vibrant',
    presets: [{ id: 'x', name: 'ASA', nozzle: 260, bed: 100 }],
  },
};

describe('backup', () => {
  it('round-trips printers, the active printer and settings', () => {
    const restored = parseBackup(backupJson(state));
    expect(restored.printers).toEqual(state.printers);
    expect(restored.activeId).toBe('b');
    expect(restored.settings.color).toBe('#3366ff');
    expect(restored.settings.paletteStyle).toBe('vibrant');
    expect(restored.settings.presets).toEqual(state.settings.presets);
    expect(restored.settings.onboarded).toBe(true);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"printers": []}')).toThrow('invalid');
  });

  it('rejects backups from a newer format', () => {
    const newer = JSON.stringify({ format: 'printer-hub-backup', version: 99 });
    expect(() => parseBackup(newer)).toThrow('newer');
  });

  it('drops invalid printers and settings, keeping defaults', () => {
    const restored = parseBackup(
      JSON.stringify({
        format: 'printer-hub-backup',
        version: 1,
        printers: [{ name: 'no host' }, { host: ' 10.0.0.2 ', port: 'bad' }],
        activeId: 'missing',
        settings: { theme: 42, fileView: 'grid', presets: [{ name: 'broken' }], extra: true },
      }),
    );
    expect(restored.printers).toHaveLength(1);
    expect(restored.printers[0]).toMatchObject({ host: '10.0.0.2', port: 7125 });
    expect(restored.activeId).toBe(restored.printers[0].id);
    expect(restored.settings.theme).toBe('system');
    expect(restored.settings.fileView).toBe('grid');
    expect(restored.settings.presets).toEqual([]);
    expect(restored.settings).not.toHaveProperty('extra');
  });
});
