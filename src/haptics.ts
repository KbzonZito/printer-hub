import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from './native';

/** Subtle vibration for actions that change the print: pause, cancel, emergency stop. */
export function haptic(kind: 'tap' | 'warning' | 'error') {
  if (!isNative) return;
  const done =
    kind === 'tap'
      ? Haptics.impact({ style: ImpactStyle.Medium })
      : Haptics.notification({
          type: kind === 'warning' ? NotificationType.Warning : NotificationType.Error,
        });
  done.catch(() => {});
}
