// This mirrors the RLS policies in supabase/schema.sql so the UI can hide
// buttons a user isn't allowed to use. The real enforcement always happens
// in Postgres (RLS) — this file only controls what's shown client-side.

export const ROLES = ['owner', 'munshi', 'godown_incharge', 'sales_staff'];

export const ROLE_LABELS = {
  owner: 'Owner / Admin',
  munshi: 'Munshi / Accountant',
  godown_incharge: 'Godown Incharge',
  sales_staff: 'Sales Staff',
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

export function canWrite(role, moduleKey) {
  return (CAN_WRITE[moduleKey] || []).includes(role);
}
