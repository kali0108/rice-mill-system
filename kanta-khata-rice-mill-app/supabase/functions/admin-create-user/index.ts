// Kanta Khata — admin-create-user Edge Function
//
// Two actions, both Owner-only (checked against the caller's own profile row
// using the service-role client, which bypasses RLS — that's the point of
// doing this server-side instead of from the browser):
//   { action: "create", email, password, full_name, role }
//   { action: "reset_password", target_user, password }
//
// Deploy with:
//   supabase login
//   supabase link --project-ref YOUR-PROJECT-REF
//   supabase functions deploy admin-create-user
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// the Supabase platform for every Edge Function — no manual secret setup needed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VALID_ROLES = ['owner', 'munshi', 'godown_incharge', 'sales_staff'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return json({ error: 'Missing auth token' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Identify the caller from their own session token.
    const { data: callerData, error: callerErr } = await admin.auth.getUser(jwt);
    if (callerErr || !callerData?.user) return json({ error: 'Invalid session' }, 401);

    // Confirm the caller is an active Owner — this is the real access check.
    const { data: callerProfile } = await admin
      .from('profiles').select('role, status').eq('id', callerData.user.id).single();
    if (!callerProfile || callerProfile.role !== 'owner' || callerProfile.status !== 'active') {
      return json({ error: 'Only the Owner can do this' }, 403);
    }

    const body = await req.json();

    if (body.action === 'create') {
      const { email, password, full_name, role } = body;
      if (!email || !password || !role) return json({ error: 'Email, password aur role zaroori hain' }, 400);
      if (password.length < 8) return json({ error: 'Password kam az kam 8 characters ka ho' }, 400);
      if (!VALID_ROLES.includes(role)) return json({ error: 'Invalid role' }, 400);

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: full_name || '' },
      });
      if (createErr) return json({ error: createErr.message }, 400);

      // The on_auth_user_created trigger already inserted a 'pending' profile
      // row for them — upgrade it to the role the Owner actually chose.
      const { error: updateErr } = await admin
        .from('profiles')
        .update({ role, status: 'active', full_name: full_name || '' })
        .eq('id', created.user.id);
      if (updateErr) return json({ error: updateErr.message }, 400);

      return json({ id: created.user.id });
    }

    if (body.action === 'reset_password') {
      const { target_user, password } = body;
      if (!target_user || !password) return json({ error: 'target_user aur password zaroori hain' }, 400);
      if (password.length < 8) return json({ error: 'Password kam az kam 8 characters ka ho' }, 400);

      const { error: pwErr } = await admin.auth.admin.updateUserById(target_user, { password });
      if (pwErr) return json({ error: pwErr.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Server error' }, 500);
  }
});
