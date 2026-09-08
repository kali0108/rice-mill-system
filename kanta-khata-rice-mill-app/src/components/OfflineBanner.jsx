import { useEffect, useState } from 'react';
import { outboxCount, syncOutbox } from '../lib/offline';
import { supabase } from '../lib/supabaseClient';

export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refreshCount = () => outboxCount().then(setPending);
    refreshCount();
    const onOnline = async () => { setOnline(true); await syncOutbox(supabase); refreshCount(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const interval = setInterval(refreshCount, 4000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div className={`offline-banner ${online ? 'syncing' : 'offline'}`}>
      {online
        ? `Wapis online — ${pending} entry sync ho rahi ${pending === 1 ? 'hai' : 'hain'}…`
        : `Aap offline hain — entries save ho rahi hain, net aane par auto-sync ho jayengi.${pending ? ` (${pending} pending)` : ''}`}
    </div>
  );
}
