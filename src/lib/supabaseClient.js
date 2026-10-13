import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// False when .env.local / Vercel env vars were never filled in — the app then
// shows a clear setup screen instead of failing with confusing errors.
export const isConfigured = Boolean(url && anonKey && !/YOUR-PROJECT|your-anon/i.test(`${url} ${anonKey}`));

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
