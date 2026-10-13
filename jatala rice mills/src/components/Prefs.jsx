import { useState } from 'react';
import { getLang, setLang, T } from '../lib/i18n';
import { getTheme, setTheme } from '../lib/theme';

// English / Roman Urdu + light / dark switches (top bar and login page)
export default function Prefs({ className = '' }) {
  const [theme, setThemeState] = useState(getTheme);
  const lang = getLang();
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };
  return (
    <div className={`prefs ${className}`}>
      <div className="seg" role="group" aria-label={T('Zaban (language)')}>
        <button type="button" className={lang === 'ur' ? 'on' : ''} onClick={() => lang !== 'ur' && setLang('ur')} title="Roman Urdu">UR</button>
        <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => lang !== 'en' && setLang('en')} title="English">EN</button>
      </div>
      <button type="button" className="theme-btn" onClick={flip} aria-label={theme === 'dark' ? T('Light mode') : T('Dark mode')} title={theme === 'dark' ? T('Light mode') : T('Dark mode')}>
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </div>
  );
}
