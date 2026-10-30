import { describe, expect, it } from 'vitest';
import { baseName, formatBytes, formatClock, formatDuration } from './format';

describe('formatting', () => {
  it('durations', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe('3 h 05 min');
    for (const v of [null, 0, -5, Infinity, NaN]) expect(formatDuration(v)).toBe('—');
  });

  it('sizes', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(610666)).toBe('596 KB');
    expect(formatBytes(23180643)).toBe('22.1 MB');
  });

  it('clock times, with the weekday when not today', () => {
    const now = new Date();
    expect(formatClock(now, 'en')).not.toMatch(/^[A-Za-z]/);
    const later = new Date(now.getTime() + 3 * 86400_000);
    expect(formatClock(later, 'en')).toMatch(/^[A-Za-z]{3} /);
    expect(formatClock(null, 'es')).toBe('—');
  });

  it('file names without folders or G-code extensions', () => {
    expect(baseName('Random Prints/Nozzle cover_PLA_3h28m.gcode')).toBe('Nozzle cover_PLA_3h28m');
    expect(baseName('part.GCO')).toBe('part');
    expect(baseName('notes.txt')).toBe('notes.txt');
  });
});
