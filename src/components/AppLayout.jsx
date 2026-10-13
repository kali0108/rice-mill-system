import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Prefs from './Prefs';
import OfflineBanner from './OfflineBanner';
import UpdateBanner from './UpdateBanner';
import ErrorBoundary from './ErrorBoundary';
import { DataProvider } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { fmtDate, todayStr } from '../lib/dates';
import { T } from '../lib/i18n';

const TITLES = {
  '/dashboard': T('Dashboard'), '/purchase': T('Paddy Purchase (Kharid)'), '/parties': T('Parties'), '/statement': T('Khata Statement'),
  '/ledger': T('Khata / Ledger'), '/payments': T('Payments & Cheques'), '/cashbook': T('Cash Book / Rokar'),
  '/production': T('Production'), '/stock': T('Stock / Godown'), '/guide': T('Guide / Madad'), '/products': T('Products & Varieties'), '/analytics': T('Stats / Analytics'), '/contracts': T('Sauda / Contracts'), '/weighbridge': T('Kanta (Weighbridge)'), '/drying': T('Paddy Sukhai (Drying)'), '/bags': T('Bardana (Boriyan)'), '/sales': T('Sales & Billing'), '/labor': T('Labor & Wages'),
  '/transport': T('Transport / Logistics'), '/expenses': T('Machinery & Kharche'), '/tax': T('Tax & Zakat'), '/reports': T('Reports'),
  '/calculator': T('Calculator'), '/users': T('Users & Roles'), '/settings': T('Mill Settings'), '/activity': T('Activity Log'),
  '/import-export': T('Backup / Import / Export'), '/reset': T('Reset / Delete Data'), '/account': T('Mera Account'),
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
    document.title = title ? `${title} — Jatala Rice Mills` : 'Jatala Rice Mills';
  }, [title]);

  const quick = [
    canWrite(profile, 'purchase') && { to: '/purchase', label: T("+ Kharid") },
    canWrite(profile, 'sales') && { to: '/sales', label: T("+ Bill") },
    canWrite(profile, 'payments') && { to: '/payments', label: T("+ Payment") },
    canWrite(profile, 'production') && { to: '/production', label: T("+ Production") },
  ].filter(Boolean);

  return (
    <DataProvider>
      <div className="app">
        <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
        <main className="main">
          <UpdateBanner />
          <header className="topbar">
            <button type="button" className="hamburger" aria-label={T("Menu")} onClick={() => setNavOpen((o) => !o)}>
              <span /><span /><span />
            </button>
            <div className="titlebox">
              <h1>{title}</h1>
              <div className="date">{fmtDate(todayStr())}</div>
            </div>
            <Prefs />
            <div className="quickbtns">
              {quick.map((q) => (
                <button key={q.to} type="button" className="btn" onClick={() => navigate(q.to)}>{q.label}</button>
              ))}
            </div>
          </header>
          <OfflineBanner />
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<div className="empty loading-line">{T("Loading…")}</div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </DataProvider>
  );
}
