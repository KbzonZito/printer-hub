import { describe, expect, it } from 'vitest';
import {
  mergeStatus,
  namesFromObjects,
  needsFanScale,
  parseStatus,
  queryString,
  subscription,
  withFanScale,
  type RawStatus,
} from './statusModel';

const NONE = { chamber: null, lightPin: null, fan: null, fanScale: 1 };
const HI = {
  chamber: 'temperature_sensor chamber_temp',
  lightPin: 'output_pin LED',
  fan: 'output_pin fan0',
  fanScale: 255,
};

describe('mergeStatus', () => {
  it('updates only the fields that changed', () => {
    const raw: RawStatus = { extruder: { temperature: 200, target: 210 }, fan: { speed: 1 } };
    const next = mergeStatus(raw, { extruder: { temperature: 205 } });
    expect(next).toEqual({ extruder: { temperature: 205, target: 210 }, fan: { speed: 1 } });
  });

  it('does not modify the previous state', () => {
    const raw: RawStatus = { extruder: { temperature: 200 } };
    mergeStatus(raw, { extruder: { temperature: 205 } });
    expect(raw.extruder.temperature).toBe(200);
  });

  it('replaces nested values whole instead of merging inside them', () => {
    const raw: RawStatus = { print_stats: { info: { current_layer: 3, total_layer: 10 } } };
    const next = mergeStatus(raw, { print_stats: { info: { current_layer: null } } });
    expect(next.print_stats.info).toEqual({ current_layer: null });
  });

  it('replaces arrays and accepts null', () => {
    const raw: RawStatus = {
      toolhead: { position: [1, 2, 3, 0] },
      display_status: { message: 'x' },
    };
    const next = mergeStatus(raw, {
      toolhead: { position: [4, 5, 6, 0] },
      display_status: { message: null },
    });
    expect(next.toolhead.position).toEqual([4, 5, 6, 0]);
    expect(next.display_status.message).toBeNull();
  });

  it('adds objects that were not there', () => {
    expect(mergeStatus({}, { fan: { speed: 0.5 } })).toEqual({ fan: { speed: 0.5 } });
  });
});

describe('subscription', () => {
  it('includes the optional objects only when the printer has them', () => {
    expect(subscription(NONE)).not.toHaveProperty('output_pin LED');
    const sub = subscription(HI);
    expect(sub['output_pin LED']).toEqual(['value']);
    expect(sub['temperature_sensor chamber_temp']).toEqual(['temperature', 'target']);
  });

  it('builds the HTTP query with field lists', () => {
    expect(queryString({ extruder: ['temperature', 'target'], 'output_pin LED': ['value'] })).toBe(
      'extruder=temperature,target&output_pin%20LED=value',
    );
  });
});

describe('parseStatus', () => {
  it('gives safe defaults for an empty status', () => {
    const s = parseStatus({}, NONE);
    expect(s.state).toBe('standby');
    expect(s.klippyState).toBe('unknown');
    expect(s.extruder).toEqual({ temperature: 0, target: 0 });
    expect(s.chamber).toBeNull();
    expect(s.light).toBeNull();
    expect(s.currentLayer).toBeNull();
  });

  it('reads a printing Creality Hi', () => {
    const s = parseStatus(
      {
        webhooks: { state: 'ready', state_message: 'Printer is ready' },
        print_stats: {
          state: 'printing',
          filename: 'Benchy.gcode',
          print_duration: 120,
          info: { current_layer: 4, total_layer: 200 },
        },
        virtual_sdcard: { progress: 0.25 },
        display_status: { progress: 0.3 },
        extruder: { temperature: 209.5, target: 210, can_extrude: true },
        toolhead: { homed_axes: 'xyz', position: [10, 20, 0.8, 100] },
        gcode_move: { homing_origin: [0, 0, -0.05, 0], speed_factor: 1.2 },
        'temperature_sensor chamber_temp': { temperature: 31 },
        'output_pin LED': { value: 1 },
        'output_pin fan0': { value: 127.5 },
      },
      HI,
    );
    expect(s).toMatchObject({
      klippyState: 'ready',
      state: 'printing',
      progress: 0.25,
      displayProgress: 0.3,
      currentLayer: 4,
      totalLayer: 200,
      position: [10, 20, 0.8],
      zOffset: -0.05,
      speedFactor: 1.2,
      canExtrude: true,
      chamber: { temperature: 31, target: 0 },
      light: { pin: 'LED', on: true },
      fanSpeed: 0.5,
    });
  });

  it('uses the Klipper message when the print has none', () => {
    const s = parseStatus(
      {
        webhooks: { state: 'shutdown', state_message: 'MCU shutdown' },
        print_stats: { state: 'error' },
      },
      NONE,
    );
    expect(s.message).toBe('MCU shutdown');
    expect(s.state).toBe('error');
  });

  it('falls back between the two progress sources', () => {
    expect(parseStatus({ display_status: { progress: 0.4 } }, NONE).progress).toBe(0.4);
    expect(parseStatus({ virtual_sdcard: { progress: 0.2 } }, NONE).displayProgress).toBe(0.2);
  });
});

describe('fan', () => {
  // Real object list of a Creality Hi (docs/plans/creality-hi.md), trimmed.
  const hiObjects = [
    'webhooks',
    'output_pin fanp0',
    'output_pin fan0',
    'output_pin board_fan',
    'heater_fan hotend_fan',
    'output_pin LED',
    'fan_feedback',
    'extruder',
  ];

  it('finds the part fan of a Creality Hi and reads its scale from the config', () => {
    const names = namesFromObjects(hiObjects);
    expect(names.fan).toBe('output_pin fan0');
    expect(needsFanScale(names)).toBe(true);
    const scaled = withFanScale(names, { 'output_pin fan0': { scale: 255, pwm: true } });
    expect(scaled.fanScale).toBe(255);
    expect(subscription(scaled)['output_pin fan0']).toEqual(['value']);
    expect(parseStatus({ 'output_pin fan0': { value: 255 } }, scaled).fanSpeed).toBe(1);
  });

  it('prefers the standard fan object', () => {
    const names = namesFromObjects(['fan', 'output_pin fan0']);
    expect(names.fan).toBe('fan');
    expect(needsFanScale(names)).toBe(false);
    expect(subscription(names).fan).toEqual(['speed']);
    expect(parseStatus({ fan: { speed: 0.3 } }, names).fanSpeed).toBe(0.3);
  });

  it('keeps scale 1 when the config has no scale', () => {
    const names = namesFromObjects(hiObjects);
    expect(withFanScale(names, {}).fanScale).toBe(1);
    expect(withFanScale(names, undefined).fanScale).toBe(1);
  });

  it('reports 0 without a fan', () => {
    expect(namesFromObjects(['extruder']).fan).toBeNull();
    expect(parseStatus({}, NONE).fanSpeed).toBe(0);
  });
});
