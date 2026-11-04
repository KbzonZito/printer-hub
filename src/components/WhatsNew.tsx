import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useT, type MessageKey } from '../i18n';
import { openExternal } from '../native';
import { STORE_KEY } from '../store';
import { Sheet } from './ui';

// "What's new": opens once after the app is updated, with this version's changes from the
// changelog (bundled at build time, see vite.config.ts). Not after a fresh install.

const SEEN_KEY = 'printer-hub:seen-version';
const RELEASES_URL = 'https://github.com/KbzonZito/printer-hub/releases';
const GROUP_KEYS: Record<string, MessageKey> = {
  Added: 'whatsNew.added',
  Changed: 'whatsNew.changed',
  Fixed: 'whatsNew.fixed',
};

/** Decided once at startup, before the welcome wizard saves anything. */
const pending = (() => {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    // Versions before 1.1 didn't record this: saved settings mean an update, not an install.
    const updated = seen !== null || localStorage.getItem(STORE_KEY) !== null;
    localStorage.setItem(SEEN_KEY, __APP_VERSION__);
    const notes = __RELEASE_NOTES__;
    return updated && seen !== __APP_VERSION__ && (notes.intro !== '' || notes.groups.length > 0);
  } catch {
    return false;
  }
})();

export function WhatsNew() {
  const t = useT();
  const [open, setOpen] = useState(pending);
  const { intro, groups } = __RELEASE_NOTES__;
  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title={t('whatsNew.title', { version: __APP_VERSION__.split('-')[0] })}
    >
      <div className="whats-new">
        <div className="wizard-icon">
          <Sparkles size={28} />
        </div>
        {intro && <p>{intro}</p>}
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.title}>
              <h4>{GROUP_KEYS[g.title] ? t(GROUP_KEYS[g.title]) : g.title}</h4>
              <ul>
                {g.items.map((item) => (
                  <li key={item}>{item.replace(/`/g, '')}</li>
                ))}
              </ul>
            </section>
          ))}
        <button className="btn primary" onClick={() => setOpen(false)}>
          {t('whatsNew.ok')}
        </button>
        <button className="btn ghost" onClick={() => openExternal(RELEASES_URL)}>
          {t('whatsNew.all')}
        </button>
      </div>
    </Sheet>
  );
}
