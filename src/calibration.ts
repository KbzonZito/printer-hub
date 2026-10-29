// Results of Klipper's calibration commands, read from the G-code responses.

export interface PidResult {
  kp: number;
  ki: number;
  kd: number;
}

/** "PID parameters: pid_Kp=22.865 pid_Ki=1.574 pid_Kd=83.052" */
export function parsePid(lines: string[]): PidResult | null {
  for (const line of [...lines].reverse()) {
    const m = line.match(/pid_Kp=([\d.]+)\s+pid_Ki=([\d.]+)\s+pid_Kd=([\d.]+)/i);
    if (m) return { kp: Number(m[1]), ki: Number(m[2]), kd: Number(m[3]) };
  }
  return null;
}

export interface ShaperResult {
  axis: 'x' | 'y';
  type: string;
  freq: number;
}

/** "Recommended shaper_type_x = mzv, shaper_freq_x = 53.8 Hz" (one line per axis). */
export function parseShaper(lines: string[]): ShaperResult[] {
  const out = new Map<string, ShaperResult>();
  for (const line of lines) {
    const m = line.match(/shaper_type_([xy])\s*=\s*(\w+),\s*shaper_freq_\1\s*=\s*([\d.]+)/i);
    if (m) {
      const axis = m[1].toLowerCase() as 'x' | 'y';
      out.set(axis, { axis, type: m[2], freq: Number(m[3]) });
    }
  }
  return [...out.values()].sort((a, b) => a.axis.localeCompare(b.axis));
}

/** After ACCEPT: "probe: z_offset: 1.234" or "stepper_z: position_endstop: 0.987". */
export function parseZOffset(lines: string[]): { key: string; value: number } | null {
  for (const line of [...lines].reverse()) {
    const m = line.match(
      /(probe|bltouch|stepper_z|[\w ]+?):\s*(z_offset|position_endstop):\s*(-?[\d.]+)/i,
    );
    if (m) return { key: `${m[1].trim()}.${m[2]}`, value: Number(m[3]) };
  }
  return null;
}

/** Klipper reports errors with "!! " (e.g. "!! Must home axis first"). */
export function lastError(lines: string[]): string | null {
  for (const line of [...lines].reverse()) if (line.startsWith('!!')) return line.slice(2).trim();
  return null;
}
