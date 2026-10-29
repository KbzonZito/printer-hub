import { describe, expect, it } from 'vitest';
import { lastError, parsePid, parseShaper, parseZOffset } from './calibration';

describe('calibration results', () => {
  it('reads the PID values', () => {
    expect(
      parsePid([
        '// sample:1 pwm:1.0000 asymmetry:3.7519 tolerance:n/a',
        '// PID parameters: pid_Kp=22.865 pid_Ki=1.574 pid_Kd=83.052',
        '// The SAVE_CONFIG command will update the printer config file',
      ]),
    ).toEqual({ kp: 22.865, ki: 1.574, kd: 83.052 });
    expect(parsePid(['ok'])).toBeNull();
  });

  it('reads the recommended input shaper for each axis', () => {
    expect(
      parseShaper([
        '// Fitted shaper zv frequency = 56.4 Hz (vibrations = 9.1%, smoothing ~= 0.044)',
        '// Recommended shaper_type_x = mzv, shaper_freq_x = 53.8 Hz',
        '// Recommended shaper_type_y = ei, shaper_freq_y = 61.2 Hz',
      ]),
    ).toEqual([
      { axis: 'x', type: 'mzv', freq: 53.8 },
      { axis: 'y', type: 'ei', freq: 61.2 },
    ]);
  });

  it('reads the new Z offset or endstop position', () => {
    expect(parseZOffset(['// probe: z_offset: 1.234'])).toEqual({
      key: 'probe.z_offset',
      value: 1.234,
    });
    expect(parseZOffset(['// stepper_z: position_endstop: -0.050'])).toEqual({
      key: 'stepper_z.position_endstop',
      value: -0.05,
    });
  });

  it('finds Klipper errors', () => {
    expect(lastError(['ok', '!! Must home axis first: 0.000 0.000 0.000'])).toBe(
      'Must home axis first: 0.000 0.000 0.000',
    );
    expect(lastError(['ok'])).toBeNull();
  });
});
