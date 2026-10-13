// Jatala Rice Mills — admin-create-user Edge Function (v5.4)
//
// Owner / Manager actions, checked server-side with the service-role key (which
// must never be in the browser — that is why this runs on Supabase).
// A Manager may only create / reset / delete staff below him (munshi,
// godown_incharge, sales_staff); only the Owner can touch Owners/Managers.
//   { action: "create", email, password, full_name, role }
//   { action: "reset_password", target_user, password }
//   { action: "list" }                      -> login emails for the Users page
//   { action: "delete", target_user }       -> remove a staff login (entries stay)
//
// Deploy: Supabase Dashboard -> Edge Functions -> "admin-create-user" -> paste
// this file -> Deploy (keep "Verify JWT" ON). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ROLES = ['owner', 'manager', 'munshi', 'godown_incharge', 'sales_staff'];
const STAFF = ['munshi', 'godown_incharge', 'sales_staff'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function friendly(message: string): string {
  if (/already (been )?registered|already exists/i.test(message)) return 'Is email se account pehle se bana hua hai.';
  if (/password/i.test(message) && /(weak|short|least)/i.test(message)) return 'Password kamzor hai — kam az kam 8 characters, harf aur number milayein.';
  if (/invalid email|unable to validate email/i.test(message)) return 'Email sahi nahi hai.';
  return message;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Function ka setup adhoora hai (service key nahi mili).' }, 500);

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Login zaroori hai' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    // Who is calling? (verified from their own session token)
    const { data: caller, error: callerErr } = await admin.auth.getUser(jwt);
    if (callerErr || !caller?.user) return json({ error: 'Session khatam ho gaya — dobara login karein' }, 401);

    const { data: me } = await admin.from('profiles').select('role, status').eq('id', caller.user.id).maybeSingle();
    if (!me || !['owner', 'manager'].includes(me.role) || me.status !== 'active') return json({ error: 'Yeh kaam sirf Owner ya Manager kar sakta hai' }, 403);
    const isOwner = me.role === 'owner';

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Ghalat request' }, 400);
    }
    const action = String(body.action ?? '');

    if (action === 'list') {
      const users: { id: string; email: string | undefined }[] = [];
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) return json({ error: error.message }, 400);
        users.push(...data.users.map((u) => ({ id: u.id, email: u.email })));
        if (data.users.length < 200) break;
      }
      return json({ users });
    }

    if (action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const fullName = String(body.full_name ?? '').trim();
      const role = String(body.role ?? '');
      if (!EMAIL_RE.test(email)) return json({ error: 'Email sahi nahi hai' }, 400);
      if (password.length < 8) return json({ error: 'Password kam az kam 8 characters ka ho' }, 400);
      if (!ROLES.includes(role)) return json({ error: 'Role ghalat hai' }, 400);
      if (!isOwner && !STAFF.includes(role)) return json({ error: 'Manager sirf Munshi, Godown aur Sales staff bana sakta hai' }, 403);

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (createErr || !created?.user) return json({ error: friendly(createErr?.message ?? 'Account nahi bana') }, 400);

      // The database trigger created a 'pending' profile — give it the chosen role.
      const { error: upErr } = await admin.from('profiles')
        .upsert({ id: created.user.id, full_name: fullName, role, status: 'active' }, { onConflict: 'id' });
      if (upErr) {
        await admin.auth.admin.deleteUser(created.user.id); // don't leave a half-made login behind
        return json({ error: 'Profile set nahi ho saki: ' + upErr.message }, 400);
      }
      return json({ id: created.user.id });
    }

    if (action === 'reset_password' || action === 'delete') {
      const target = String(body.target_user ?? '');
      if (!target) return json({ error: 'User chunein' }, 400);
      if (target === caller.user.id) {
        return json({ error: action === 'delete' ? 'Aap apna khud ka account delete nahi kar sakte' : 'Apna password "Mera Account" page se badlein' }, 400);
      }
      const { data: targetProfile } = await admin.from('profiles').select('role').eq('id', target).maybeSingle();
      if (targetProfile?.role === 'owner') return json({ error: 'Doosre Owner ka account yahan se nahi badla ja sakta' }, 403);
      if (!isOwner && targetProfile?.role === 'manager') return json({ error: 'Manager doosre Manager ka account nahi badal sakta' }, 403);

      if (action === 'reset_password') {
        const password = String(body.password ?? '');
        if (password.length < 8) return json({ error: 'Password kam az kam 8 characters ka ho' }, 400);
        const { error } = await admin.auth.admin.updateUserById(target, { password });
        if (error) return json({ error: friendly(error.message) }, 400);
        return json({ ok: true });
      }

      const { error } = await admin.auth.admin.deleteUser(target);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Server error' }, 500);
  }
});
