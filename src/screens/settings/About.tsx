import { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Bug, Coffee, Heart, Share2 } from 'lucide-react';
import { useConnectionSnapshot } from '../../usePrinterStatus';
import { fetchVersions, type SystemVersions } from '../../api/moonraker';
import { isNative, openExternal, shareText } from '../../native';
import { useT } from '../../i18n';
import { type Printer } from '../../store';

// About: version, author, links, support (Ko-fi) and the connected printer.

export const REPO_URL = 'https://github.com/KbzonZito/printer-hub';
const AUTHOR_URL = 'https://github.com/KbzonZito';
/** Ko-fi page. Leave it empty in a Google Play build: Play doesn't allow outside payment links,
 *  and without a link the card is hidden. */
const DONATE_URL = 'https://ko-fi.com/kbzonzito';
const REMOTE_ACCESS_URL = `${REPO_URL}/blob/main/docs/remote-access.md`;

// Lucide no longer ships brand logos.
export function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export function useAppVersion() {
  const [version, setVersion] = useState(__APP_VERSION__);
  useEffect(() => {
    if (!isNative) return;
    CapApp.getInfo()
      .then((i) => setVersion(i.version))
      .catch(() => {});
  }, []);
  return version;
}

export function About({ printer }: { printer: Printer | null }) {
  const t = useT();
  const { mode } = useConnectionSnapshot();
  const version = useAppVersion();
  const [versions, setVersions] = useState<SystemVersions | null>(null);
  useEffect(() => {
    if (!printer) return;
    fetchVersions(printer)
      .then(setVersions)
      .catch(() => {});
  }, [printer?.id]);
  return (
    <div className="about">
      <h3>Printer Hub v{version}</h3>
      <p className="muted small">{t('about.tagline')}</p>
      <div className="about-images">
        <img src="./icon.svg" alt="" />
        <img
          src={`${AUTHOR_URL}.png?size=160`}
          alt="KbzonZito"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      </div>
      <span className="made-by">
        {t('about.madeWith')} <Heart size={16} /> {t('about.by')}
        <button type="button" onClick={() => openExternal(AUTHOR_URL)}>
          KbzonZito
        </button>
      </span>
      <button type="button" className="btn primary" onClick={() => openExternal(REPO_URL)}>
        <GithubIcon /> {t('about.star')}
      </button>
      {DONATE_URL && (
        <div className="coffee-card">
          <p className="small">{t('about.coffeeText')}</p>
          <button type="button" className="btn coffee" onClick={() => openExternal(DONATE_URL)}>
            <Coffee size={18} /> {t('about.coffee')}
          </button>
        </div>
      )}
      <div className="row gap">
        <button
          type="button"
          className="btn grow"
          onClick={() => openExternal(`${REPO_URL}/issues/new`)}
        >
          <Bug size={18} /> {t('about.issue')}
        </button>
        <button
          type="button"
          className="btn grow"
          onClick={() => shareText(t('about.shareText', { url: REPO_URL }))}
        >
          <Share2 size={18} /> {t('about.share')}
        </button>
      </div>
      {printer && (
        <div className="about-meta">
          <strong>{t('about.printer')}</strong>
          <div className="estimate-row">
            <span className="muted">Host</span>
            <span>{versions?.hostname ?? printer.host}</span>
          </div>
          {versions?.klipper && (
            <div className="estimate-row">
              <span className="muted">Klipper</span>
              <span>{versions.klipper.split('-')[0]}</span>
            </div>
          )}
          {versions?.moonraker && (
            <div className="estimate-row">
              <span className="muted">Moonraker</span>
              <span>{versions.moonraker.split('-')[0]}</span>
            </div>
          )}
          <div className="estimate-row">
            <span className="muted">{t('conn.mode')}</span>
            <span>{mode === 'realtime' ? t('conn.realtime') : t('conn.polling')}</span>
          </div>
        </div>
      )}
      <p className="muted small">{t('settings.aboutText')}</p>
      <div className="about-links">
        <button type="button" onClick={() => openExternal(REPO_URL)}>
          {t('about.source')}
        </button>
        <span>·</span>
        <button type="button" onClick={() => openExternal(`${REPO_URL}/releases`)}>
          {t('about.releases')}
        </button>
        <span>·</span>
        <button type="button" onClick={() => openExternal(`${REPO_URL}#readme`)}>
          {t('about.help')}
        </button>
        <span>·</span>
        <button type="button" onClick={() => openExternal(REMOTE_ACCESS_URL)}>
          {t('about.remote')}
        </button>
      </div>
    </div>
  );
}
