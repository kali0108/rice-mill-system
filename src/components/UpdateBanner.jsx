import { useEffect, useState } from 'react';
import { T } from '../lib/i18n';

// Shown when a new version of the app has been deployed and downloaded.
export default function UpdateBanner() {
  const [waiting, setWaiting] = useState(() => window.__kkWaitingWorker || null);
  useEffect(() => {
    const onUpdate = (e) => setWaiting(e.detail);
    window.addEventListener('kk:update-available', onUpdate);
    return () => window.removeEventListener('kk:update-available', onUpdate);
  }, []);
  if (!waiting) return null;
  return (
    <div className="update-banner">
      <span>{T("App ka naya version aa gaya hai.")}</span>
      <button
        type="button"
        className="btn small gold"
        onClick={() => {
          waiting.postMessage('skipWaiting');
          setTimeout(() => window.location.reload(), 1200);
        }}
      >{T("Update Karein")}</button>
    </div>
  );
}
