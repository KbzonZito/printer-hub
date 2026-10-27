import type { Printer } from '../store';
import { get, post } from './moonraker';

// Smart plugs and other power devices: https://moonraker.readthedocs.io/en/latest/web_api/#power-apis

export interface PowerDevice {
  device: string;
  status: 'on' | 'off' | 'init' | 'error';
  locked_while_printing: boolean;
  type: string;
}

export const listPowerDevices = async (p: Printer) =>
  (await get<{ devices: PowerDevice[] }>(p, '/machine/device_power/devices')).devices;

export const setPower = (p: Printer, device: string, on: boolean) =>
  post<Record<string, string>>(
    p,
    `/machine/device_power/device?device=${encodeURIComponent(device)}&action=${on ? 'on' : 'off'}`,
  );
