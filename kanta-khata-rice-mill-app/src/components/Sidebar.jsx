import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../lib/roles';

const ICON = {
  dashboard: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.2"/><rect x="11" y="2.5" width="6.5" height="6.5" rx="1.2"/><rect x="2.5" y="11" width="6.5" height="6.5" rx="1.2"/><rect x="11" y="11" width="6.5" height="6.5" rx="1.2"/></svg>,
  purchase: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 3l-2 5.5c0 4 3.9 8.5 5.5 8.5s5.5-4.5 5.5-8.5L13.5 3"/><path d="M7 3c.5 1.5 1.2 2 3 2s2.5-.5 3-2"/></svg>,
  ledger: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 5.2C8.6 4 6.5 3.5 3 3.5v11.8c3.5 0 5.6.5 7 1.7 1.4-1.2 3.5-1.7 7-1.7V3.5c-3.5 0-5.6.5-7 1.7z"/><path d="M10 5.2v11.8"/></svg>,
  production: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.6"/><path d="M10 3.3v2M10 14.7v2M16.7 10h-2M5.3 10h-2M14.7 5.3l-1.4 1.4M6.7 13.3l-1.4 1.4M14.7 14.7l-1.4-1.4M6.7 6.7L5.3 5.3"/></svg>,
  stock: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.7 6.2 10 2.8l7.3 3.4v7.6L10 17.2 2.7 13.8z"/><path d="M2.7 6.2 10 9.6l7.3-3.4M10 9.6v7.6"/></svg>,
  sales: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2.5h10v15l-2-1.3-1.5 1.3L10 16.2 8.5 17.5 7 16.2 5 17.5z"/><path d="M7.3 6.3h5.4M7.3 9.3h5.4M7.3 12.3h3"/></svg>,
  payments: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2.3" y="5" width="15.4" height="10" rx="1.6"/><circle cx="10" cy="10" r="2.3"/></svg>,
  labor: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="6.3" r="2.3"/><path d="M2.5 16c.5-3 2-4.5 4.5-4.5S11 13 11.5 16"/><circle cx="14" cy="7.3" r="1.9"/><path d="M11.8 11.2c2.2.1 3.4 1.5 3.8 4"/></svg>,
  transport: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="6" width="10" height="7" rx="1"/><path d="M11.5 8.5h3.5l2.5 2.5v2.5h-6z"/><circle cx="5" cy="15.5" r="1.4"/><circle cx="14" cy="15.5" r="1.4"/></svg>,
  expenses: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7"/><path d="M10 6v8M12.3 8.2c0-1-1-1.7-2.3-1.7s-2.3.7-2.3 1.6c0 2.4 4.6 1.1 4.6 3.5 0 1-1 1.7-2.3 1.7s-2.3-.7-2.3-1.7"/></svg>,
  tax: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2.5" width="14" height="15" rx="1.4"/><path d="M6.5 6.5h7M6.5 10h7M6.5 13.5h4"/></svg>,
  reports: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17V8M9 17V3M15 17v-6"/><path d="M2.5 17h15"/></svg>,
  users: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="6.5" r="2.6"/><path d="M2 16c.5-3.3 2.2-5 5-5s4.5 1.7 5 5"/><circle cx="15" cy="7.5" r="2"/><path d="M13 11.2c2 .2 3.3 1.7 3.7 4.8"/></svg>,
  activity: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 10.5h3l1.8-5 3.4 9 1.8-5.5h3.2l1.8 2.5"/></svg>,
  calculator: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="12" height="16" rx="1.6"/><path d="M6.3 5.3h7.4"/><circle cx="7" cy="9.2" r=".2"/><circle cx="10" cy="9.2" r=".2"/><circle cx="13" cy="9.2" r=".2"/><circle cx="7" cy="12.2" r=".2"/><circle cx="10" cy="12.2" r=".2"/><circle cx="13" cy="12.2" r=".2"/><circle cx="7" cy="15.2" r=".2"/><circle cx="10" cy="15.2" r=".2"/><circle cx="13" cy="15.2" r=".2"/></svg>,
  importExport: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8.5 6 2.5M6 2.5 3.5 5M6 2.5 8.5 5"/><path d="M14 11.5v6M14 17.5l-2.5-2.5M14 17.5l2.5-2.5"/><path d="M2.5 10.5v6h6M17.5 9.5v-6h-6"/></svg>,
  reset: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v5l3.5-2.5"/><path d="M4.2 6A7 7 0 1 0 10 3"/><path d="M10 17.5V17M10 8.5v4"/></svg>,
};

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/purchase', label: 'Paddy Purchase', icon: 'purchase' },
  { to: '/ledger', label: 'Khata / Ledger', icon: 'ledger' },
  { to: '/production', label: 'Production', icon: 'production' },
  { to: '/stock', label: 'Godown / Stock', icon: 'stock' },
  { to: '/sales', label: 'Sales & Billing', icon: 'sales' },
  { to: '/payments', label: 'Payments & Cheques', icon: 'payments' },
  { to: '/labor', label: 'Labor & Wages', icon: 'labor' },
  { to: '/transport', label: 'Transport / Logistics', icon: 'transport' },
  { to: '/expenses', label: 'Machinery & Expenses', icon: 'expenses' },
  { to: '/tax', label: 'Tax & Zakat', icon: 'tax' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/calculator', label: 'Calculator', icon: 'calculator' },
];

export default function Sidebar() {
  const { role, profile, signOut } = useAuth();
  return (
    <div className="sidebar">
      <div className="brand">
        <div className="mark">Kanta Khata</div>
        <div className="sub">Rice Mill Manager</div>
      </div>
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          {ICON[n.icon]}<span>{n.label}</span>
        </NavLink>
      ))}
      {role === 'owner' && (
        <>
          <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            {ICON.users}<span>Users & Roles</span>
          </NavLink>
          <NavLink to="/activity" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            {ICON.activity}<span>Activity Log</span>
          </NavLink>
          <NavLink to="/import-export" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            {ICON.importExport}<span>Import / Export</span>
          </NavLink>
          <NavLink to="/reset" className={({ isActive }) => `nav-item nav-item-danger ${isActive ? 'active' : ''}`}>
            {ICON.reset}<span>Reset Data</span>
          </NavLink>
        </>
      )}
      <div className="sidebar-footer">
        <div style={{ marginBottom: 6 }}>{profile?.full_name || 'Staff'} — {role ? role.replace('_', ' ') : '…'}</div>
        <button className="btn small" style={{ width: '100%' }} onClick={signOut}>Sign Out</button>
      </div>
    </div>
  );
}
