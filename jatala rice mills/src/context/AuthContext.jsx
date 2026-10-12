import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { subscribeTable, closeAllChannels } from '../lib/realtime';
import { outboxCount, clearLocalData } from '../lib/offline';
import { clearAllStores } from '../lib/tableStore';
import { clearAllRpcStores } from '../lib/rpcStore';

const AuthContext = createContext(null);
const PROFILE_KEY = 'kk:profile';

// The profile (role + permissions) is remembered on the device so the app
// keeps working when it is opened with no internet.
function readCachedProfile(uid) {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    return p && p.id === uid ? p : null;
  } catch {
    return null;
  }
}
function writeCachedProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* storage full / private mode */ }
}
function clearCachedProfile() {
  try { localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [profile, setProfile] = useState(null);
  const [profileState, setProfileState] = useState('idle'); // idle | loading | ok | missing | error
  const uidRef = useRef(null);

  const loadProfile = useCallback(async (uid) => {
    uidRef.current = uid;
    if (!uid) {
      setProfile(null);
      setProfileState('idle');
      return;
    }
    const cached = readCachedProfile(uid);
    if (cached) {
      setProfile(cached);
      setProfileState('ok');
    } else {
      setProfileState('loading');
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (uidRef.current !== uid) return;
    if (error) {
      if (!cached) setProfileState('error');
      return;
    }
    if (!data) {
      setProfile(null);
      setProfileState('missing');
      clearCachedProfile();
      return;
    }
    setProfile(data);
    setProfileState('ok');
    writeCachedProfile(data);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session || null);
      loadProfile(data.session?.user?.id || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess || null);
      const uid = sess?.user?.id || null;
      // Calling Supabase inside this callback can dead-lock the auth client,
      // so the profile load is deferred to the next tick.
      if (uid !== uidRef.current || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setTimeout(() => loadProfile(uid), 0);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Role / permission / suspension changes by the Owner apply instantly
  const uid = session?.user?.id;
  useEffect(() => {
    if (!uid) return undefined;
    return subscribeTable('profiles', (payload) => {
      if (payload.new && payload.new.id === uid) {
        setProfile(payload.new);
        writeCachedProfile(payload.new);
      }
    });
  }, [uid]);

  const signOut = useCallback(async () => {
    const pending = await outboxCount().catch(() => 0);
    if (pending > 0 && !window.confirm(
      `${pending} entries abhi server par sync nahi huin.\n\nSign out karne se yeh is device se mit jayengi. ` +
      'Behtar hai pehle internet on kar ke sync hone dein.\n\nPhir bhi Sign Out karein?'
    )) return false;
    clearAllStores();
    clearAllRpcStores();
    closeAllChannels();
    await clearLocalData().catch(() => {});
    clearCachedProfile();
    // 'local' = only this device; the default would also log the same user out
    // of every other phone/computer.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    setSession(null);
    setProfile(null);
    setProfileState('idle');
    uidRef.current = null;
    return true;
  }, []);

  let accessState = 'loading';
  if (session === null) accessState = 'signed-out';
  else if (session) {
    if (profileState === 'ok' && profile) {
      accessState = profile.status === 'suspended' ? 'suspended' : profile.role === 'pending' ? 'pending' : 'ok';
    } else if (profileState === 'missing') accessState = 'pending';
    else if (profileState === 'error') accessState = 'error';
  }

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    profile,
    role: accessState === 'ok' ? profile?.role || null : null,
    accessState,
    loading: accessState === 'loading',
    reloadProfile: () => loadProfile(session?.user?.id || null),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email: email.trim(), password }),
    signUp: (email, password, fullName) =>
      supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } }),
    signOut,
  }), [session, profile, accessState, loadProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
