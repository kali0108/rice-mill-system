import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import OfflineBanner from './OfflineBanner';
import { fmtDate, todayStr } from '../lib/calc';

const TITLES = {
  '/dashboard': 'Dashboard', '/purchase': 'Paddy Purchase', '/ledger': 'Khata / Ledger',
  '/production': 'Production', '/stock': 'Godown / Stock', '/sales': 'Sales & Billing',
  '/payments': 'Payments & Cheques', '/labor': 'Labor & Wages', '/transport': 'Transport / Logistics',
  '/expenses': 'Machinery & Expenses', '/tax': 'Tax & Zakat Compliance', '/reports': 'Reports',
  '/users': 'Users & Roles', '/activity': 'Activity Log', '/calculator': 'Calculator',
  '/import-export': 'Import / Export', '/reset': 'Reset Data',
};

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const title = TITLES[location.pathname] || '';
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <OfflineBanner />
        <div className="topbar">
          <div>
            <h1>{title}</h1>
            <div className="date">{fmtDate(todayStr())}</div>
          </div>
          <div className="quickbtns">
            <button className="btn" onClick={() => navigate('/sales')}>+ Naya Bill</button>
            <button className="btn" onClick={() => navigate('/ledger')}>+ Khata Entry</button>
            <button className="btn" onClick={() => navigate('/production')}>+ Production Entry</button>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
