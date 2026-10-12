// Mirrors role_default_permission() / has_permission() in supabase/schema.sql
// so the UI can hide what a user can't do. The real enforcement is always in
// Postgres (row-level security) — this file only decides what is shown.

export const ROLES = ['owner', 'munshi', 'godown_incharge', 'sales_staff'];
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
  cashbook: MONEY,
  tax: MONEY,
  zakat: MONEY,
  production: FLOOR,
  stock: FLOOR,
  labor: FLOOR,
  transport: FLOOR,
  machinery: FLOOR,
  expenses: FLOOR,
  weighbridge: FLOOR,
  sales: SELL,
  parties: SELL,
  products: MONEY,
  users: ['owner'],
};

export function canWrite(profile, moduleKey) {
  if (!profile || profile.status !== 'active' || profile.role === 'pending') return false;
  if (profile.role === 'owner') return true;
  const overrides = profile.permissions || {};
  if (Object.prototype.hasOwnProperty.call(overrides, moduleKey)) return overrides[moduleKey] === true;
  return (CAN_WRITE[moduleKey] || []).includes(profile.role);
}

export const MODULE_LABELS = {
  purchase: 'Paddy Purchase',
  parties: 'Parties',
  ledger: 'Khata / Ledger',
  payments: 'Payments & Cheques',
  cashbook: 'Cash Book / Rokar',
  sales: 'Sales & Billing',
  production: 'Production',
  stock: 'Godown / Stock',
  labor: 'Labor & Wages',
  transport: 'Transport',
  machinery: 'Machinery Log',
  expenses: 'Daily Expenses',
  products: 'Products & Varieties',
  weighbridge: 'Kanta (Weighbridge)',
  tax: 'Tax Records',
  zakat: 'Zakat',
  users: 'Users & Roles',
};

// Modules the Owner can allow/deny per user (Users & Roles stays Owner-only)
export const PERMISSION_MODULES = Object.keys(MODULE_LABELS).filter((m) => m !== 'users');
