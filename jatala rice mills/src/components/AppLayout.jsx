import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import OfflineBanner from './OfflineBanner';
import UpdateBanner from './UpdateBanner';
import ErrorBoundary from './ErrorBoundary';
import { DataProvider } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { fmtDate, todayStr } from '../lib/dates';

const TITLES = {
  '/dashboard': 'Dashboard', '/purchase': 'Paddy Purchase (Kharid)', '/parties': 'Parties', '/statement': 'Khata Statement',
  '/ledger': 'Khata / Ledger', '/payments': 'Payments & Cheques', '/cashbook': 'Cash Book / Rokar',
  '/production': 'Production', '/stock': 'Stock / Godown', '/products': 'Products & Varieties', '/analytics': 'Stats / Analytics', '/contracts': 'Sauda / Contracts', '/weighbridge': 'Kanta (Weighbridge)', '/drying': 'Paddy Sukhai (Drying)', '/bags': 'Bardana (Boriyan)', '/sales': 'Sales & Billing', '/labor': 'Labor & Wages',
  '/transport': 'Transport / Logistics', '/expenses': 'Machinery & Kharche', '/tax': 'Tax & Zakat', '/reports': 'Reports',
  '/calculator': 'Calculator', '/users': 'Users & Roles', '/settings': 'Mill Settings', '/activity': 'Activity Log',
  '/import-export': 'Backup / Import / Export', '/reset': 'Reset / Naya Season', '/account': 'Mera Account',
};

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const title = TITLES[location.pathname] || '';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    document.title = title ? `${title} — Kanta Khata` : 'Kanta Khata';
  }, [title]);

  const quick = [
    canWrite(profile, 'purchase') && { to: '/purchase', label: '+ Kharid' },
    canWrite(profile, 'sales') && { to: '/sales', label: '+ Bill' },
    canWrite(profile, 'payments') && { to: '/payments', label: '+ Payment' },
    canWrite(profile, 'production') && { to: '/production', label: '+ Production' },
  ].filter(Boolean);

  return (
    <DataProvider>
      <div className="app">
        <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
        <main className="main">
          <UpdateBanner />
          <header className="topbar">
            <button type="button" className="hamburger" aria-label="Menu" onClick={() => setNavOpen((o) => !o)}>
              <span /><span /><span />
            </button>
            <div className="titlebox">
              <h1>{title}</h1>
              <div className="date">{fmtDate(todayStr())}</div>
            </div>
            <div className="quickbtns">
              {quick.map((q) => (
                <button key={q.to} type="button" className="btn" onClick={() => navigate(q.to)}>{q.label}</button>
              ))}
            </div>
          </header>
          <OfflineBanner />
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<div className="empty loading-line">Loading…</div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </DataProvider>
  );
}
