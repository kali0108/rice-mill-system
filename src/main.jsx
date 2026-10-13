import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { applyTheme, getTheme } from './lib/theme';
import { getLang } from './lib/i18n';

applyTheme(getTheme());
document.documentElement.lang = getLang() === 'en' ? 'en' : 'ur-Latn';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Offline app shell (production builds only). A new deploy is downloaded in
// the background; the user gets an "Update Karein" button instead of the page
// suddenly changing under them.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const announce = (worker) => {
        window.__kkWaitingWorker = worker;
        window.dispatchEvent(new CustomEvent('kk:update-available', { detail: worker }));
      };
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) announce(nw);
        });
      });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch((e) => console.warn('[Jatala Rice Mills] service worker not registered', e));
  });
}
