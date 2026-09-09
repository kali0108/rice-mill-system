import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  async function loadProfile(userId) {
    if (!userId) { setProfile(null); return; }
    setProfileLoading(true);
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data || null);
    setProfileLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      loadProfile(data.session?.user?.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      loadProfile(sess?.user?.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // 'ok' = normal access. 'pending' = signed up without an invite, waiting on
  // the Owner. 'suspended' = Owner turned their access off. Any write/read
  // attempt for pending/suspended is already blocked server-side by RLS —
  // this just drives which screen the UI shows.
  let accessState = 'loading';
  if (session === null) accessState = 'signed-out';
  else if (session && !profileLoading && profile) {
    accessState = profile.status === 'suspended' ? 'suspended' : profile.role === 'pending' ? 'pending' : 'ok';
  }

  const value = {
    session,
    user: session?.user || null,
    profile,
    role: accessState === 'ok' ? profile?.role || null : null,
    accessState,
    loading: session === undefined || (session && profileLoading && !profile),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, fullName) =>
      supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } }),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
