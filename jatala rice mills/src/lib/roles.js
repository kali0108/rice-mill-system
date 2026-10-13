import { T } from './i18n.js';
// Mirrors role_default_permission() / role_default_can() / can_do() in
// supabase/schema.sql so the UI shows only what a user may do. The real
// enforcement is in Postgres (row-level security) — this only decides what
// is shown.

export const ROLES = ['owner', 'manager', 'munshi', 'godown_incharge', 'sales_staff'];
export const STAFF_ROLES = ['munshi', 'godown_incharge', 'sales_staff'];

export const ROLE_LABELS = {
  owner: T('Owner / Admin'),
  manager: T('Manager'),
  munshi: T('Munshi / Accountant'),
  godown_incharge: T('Godown Incharge'),
  sales_staff: T('Sales Staff'),
  pending: T('Pending Approval'),
};

const MONEY = ['owner', 'manager', 'munshi'];
const FLOOR = ['owner', 'manager', 'munshi', 'godown_incharge'];
const SELL = ['owner', 'manager', 'munshi', 'sales_staff'];

// Who may change data in a module by default
export const CAN_WRITE = {
  purchase: MONEY, ledger: MONEY, payments: MONEY, cashbook: MONEY, tax: MONEY, zakat: MONEY, products: MONEY,
  production: FLOOR, stock: FLOOR, labor: FLOOR, transport: FLOOR, machinery: FLOOR, expenses: FLOOR, weighbridge: FLOOR,
  sales: SELL, parties: SELL,
  reports: ['owner', 'manager'],
};

export const ACTIONS = ['view', 'add', 'edit', 'delete'];
export const ACTION_LABELS = { view: T('Dekhna'), add: T('Naya'), edit: T('Badalna'), delete: T('Delete') };

export function roleDefault(role, module, action) {
  if (!role || role === 'pending') return false;
  if (role === 'owner' || role === 'manager') return true;
  if (action === 'view') return true;
  return (CAN_WRITE[module] || []).includes(role);
}

// can(profile, 'purchase', 'delete')
export function can(profile, module, action = 'add') {
  if (!profile || profile.status !== 'active' || profile.role === 'pending') return false;
  if (profile.role === 'owner') return true;
  const v = (profile.permissions || {})[module];
  if (typeof v === 'boolean') return action === 'view' ? roleDefault(profile.role, module, 'view') || v : v;
  if (v && typeof v === 'object' && typeof v[action] === 'boolean') return v[action];
  return roleDefault(profile.role, module, action);
}

export const canWrite = (profile, module) => can(profile, module, 'add');
export const canView = (profile, module) => can(profile, module, 'view');
export const isAdmin = (profile) => !!profile && profile.status === 'active' && (profile.role === 'owner' || profile.role === 'manager');

// Roles an Owner / Manager may give to others
export function assignableRoles(actorRole) {
  return actorRole === 'owner' ? ROLES : STAFF_ROLES;
}

export const MODULE_LABELS = {
  purchase: T('Paddy Purchase'), parties: T('Parties'), ledger: T('Khata / Ledger'), payments: T('Payments & Cheques'),
  cashbook: T('Cash Book / Rokar'), sales: T('Sales & Billing'), production: T('Production & Sukhai'), stock: T('Godown / Stock & Bardana'),
  labor: T('Labor & Wages'), transport: T('Transport'), machinery: T('Machinery Log'), expenses: T('Daily Expenses'),
  tax: T('Tax Records'), zakat: T('Zakat'), products: T('Products & Varieties'), weighbridge: T('Kanta (Weighbridge)'),
  reports: T('Reports & Stats'),
};
export const PERMISSION_MODULES = Object.keys(MODULE_LABELS);

// Which module(s) a page belongs to (any one with "view" opens the page)
export const ROUTE_MODULES = {
  '/purchase': ['purchase'], '/weighbridge': ['weighbridge'], '/contracts': ['sales', 'purchase'], '/parties': ['parties'],
  '/statement': ['ledger'], '/ledger': ['ledger'], '/payments': ['payments'], '/cashbook': ['cashbook'],
  '/drying': ['production'], '/production': ['production'], '/stock': ['stock'], '/products': ['products'], '/bags': ['stock'],
  '/sales': ['sales'], '/labor': ['labor'], '/transport': ['transport'], '/expenses': ['expenses', 'machinery'],
  '/analytics': ['reports'], '/reports': ['reports'], '/tax': ['tax', 'zakat'],
};

export function canOpenRoute(profile, path) {
  const mods = ROUTE_MODULES[path];
  return !mods || mods.some((m) => can(profile, m, 'view'));
}
