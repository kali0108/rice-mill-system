// This mirrors the RLS policies in supabase/schema.sql so the UI can hide
// buttons a user isn't allowed to use. The real enforcement always happens
// in Postgres (RLS) — this file only controls what's shown client-side.

export const ROLES = ['owner', 'munshi', 'godown_incharge', 'sales_staff'];

// What the Owner can actively assign someone. 'pending' is a state people
// land in automatically (uninvited signup) — not a role you'd hand-pick.
export const ASSIGNABLE_ROLES = ROLES;

export const ROLE_LABELS = {
  owner: 'Owner / Admin',
  munshi: 'Munshi / Accountant',
  godown_incharge: 'Godown Incharge',
  sales_staff: 'Sales Staff',
  pending: 'Pending Approval',
};

const MONEY = ['owner', 'munshi'];
const FLOOR = ['owner', 'munshi', 'godown_incharge'];
const SELL = ['owner', 'munshi', 'sales_staff'];

export const CAN_WRITE = {
  purchase: MONEY,
  ledger: MONEY,
  payments: MONEY,
  tax: MONEY,
  zakat: MONEY,
  production: FLOOR,
  stock: FLOOR,
  labor: FLOOR,
  transport: FLOOR,
  machinery: FLOOR,
  expenses: FLOOR,
  sales: SELL,
  users: ['owner'],
};

// Real enforcement always happens in Postgres (has_permission() + RLS in
// schema.sql) — this file only controls what the UI shows/hides, mirroring
// the same role-default + per-user-override logic.
export function canWrite(profile, moduleKey) {
  if (!profile || profile.status !== 'active') return false;
  if (profile.role === 'owner') return true;
  const overrides = profile.permissions || {};
  if (Object.prototype.hasOwnProperty.call(overrides, moduleKey)) return !!overrides[moduleKey];
  return (CAN_WRITE[moduleKey] || []).includes(profile.role);
}

export const MODULE_LABELS = {
  purchase: 'Paddy Purchase',
  ledger: 'Khata / Ledger',
  payments: 'Payments & Cheques',
  tax: 'Tax Records',
  zakat: 'Zakat Assessment',
  production: 'Production',
  stock: 'Godown / Stock',
  labor: 'Labor & Wages',
  transport: 'Transport / Logistics',
  machinery: 'Machinery Log',
  expenses: 'Daily Expenses',
  sales: 'Sales & Billing',
  users: 'Users & Roles',
};

// Modules the Owner can grant/deny per-user (everything except Users & Roles
// itself, which always stays Owner-only — no override, no delegation).
export const PERMISSION_MODULES = Object.keys(MODULE_LABELS).filter((m) => m !== 'users');
