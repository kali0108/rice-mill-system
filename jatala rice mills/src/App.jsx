import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import { isConfigured } from './lib/supabaseClient';
import { T } from './lib/i18n';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Purchase = lazy(() => import('./pages/Purchase'));
const Parties = lazy(() => import('./pages/Parties'));
const Statement = lazy(() => import('./pages/Statement'));
const Ledger = lazy(() => import('./pages/Ledger'));
const Payments = lazy(() => import('./pages/Payments'));
const CashBook = lazy(() => import('./pages/CashBook'));
const Production = lazy(() => import('./pages/Production'));
const Stock = lazy(() => import('./pages/Stock'));
const Products = lazy(() => import('./pages/Products'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Contracts = lazy(() => import('./pages/Contracts'));
const Weighbridge = lazy(() => import('./pages/Weighbridge'));
const Drying = lazy(() => import('./pages/Drying'));
const Bags = lazy(() => import('./pages/Bags'));
const Guide = lazy(() => import('./pages/Guide'));
const Sales = lazy(() => import('./pages/Sales'));
const Labor = lazy(() => import('./pages/Labor'));
const Transport = lazy(() => import('./pages/Transport'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Tax = lazy(() => import('./pages/Tax'));
const Reports = lazy(() => import('./pages/Reports'));
const Calculator = lazy(() => import('./pages/Calculator'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Account = lazy(() => import('./pages/Account'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));
const ImportExport = lazy(() => import('./pages/ImportExport'));
const Reset = lazy(() => import('./pages/Reset'));

function SetupScreen() {
  return (
    <div className="status-screen">
      <div className="status-card" style={{ maxWidth: 520, textAlign: 'left' }}>
        <h1>{T("Setup adhoora hai")}</h1>
        <p>{T("Supabase ka ")}<b>{T("VITE_SUPABASE_URL")}</b>{T(" aur ")}<b>{T("VITE_SUPABASE_ANON_KEY")}</b>{T(" set nahi hain. Local computer par ")}<code>.env.local</code>{T(" file mein, ya Vercel par Project Settings → Environment Variables mein yeh dono daalein, phir dobara build/deploy karein. Poora tareeqa DEPLOYMENT_GUIDE.md mein hai.")}</p>
      </div>
    </div>
  );
}

const owner = (el) => <ProtectedRoute requireRole="owner">{el}</ProtectedRoute>;
const admin = (el) => <ProtectedRoute requireAdmin>{el}</ProtectedRoute>;
const mod = (path, el) => <ProtectedRoute path={path}>{el}</ProtectedRoute>;

export default function App() {
  if (!isConfigured) return <SetupScreen />;
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<div className="boot-loading">{T("Loading…")}</div>}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/purchase" element={mod('/purchase', <Purchase />)} />
                  <Route path="/parties" element={mod('/parties', <Parties />)} />
                  <Route path="/statement" element={mod('/statement', <Statement />)} />
                  <Route path="/ledger" element={mod('/ledger', <Ledger />)} />
                  <Route path="/payments" element={mod('/payments', <Payments />)} />
                  <Route path="/cashbook" element={mod('/cashbook', <CashBook />)} />
                  <Route path="/production" element={mod('/production', <Production />)} />
                  <Route path="/stock" element={mod('/stock', <Stock />)} />
                  <Route path="/products" element={mod('/products', <Products />)} />
                  <Route path="/analytics" element={mod('/analytics', <Analytics />)} />
                  <Route path="/contracts" element={mod('/contracts', <Contracts />)} />
                  <Route path="/weighbridge" element={mod('/weighbridge', <Weighbridge />)} />
                  <Route path="/drying" element={mod('/drying', <Drying />)} />
                  <Route path="/bags" element={mod('/bags', <Bags />)} />
                  <Route path="/sales" element={mod('/sales', <Sales />)} />
                  <Route path="/labor" element={mod('/labor', <Labor />)} />
                  <Route path="/transport" element={mod('/transport', <Transport />)} />
                  <Route path="/expenses" element={mod('/expenses', <Expenses />)} />
                  <Route path="/tax" element={mod('/tax', <Tax />)} />
                  <Route path="/reports" element={mod('/reports', <Reports />)} />
                  <Route path="/guide" element={<Guide />} />
                  <Route path="/calculator" element={<Calculator />} />
                  <Route path="/account" element={<Account />} />
                  <Route path="/users" element={admin(<Users />)} />
                  <Route path="/settings" element={owner(<Settings />)} />
                  <Route path="/activity" element={admin(<ActivityLog />)} />
                  <Route path="/import-export" element={admin(<ImportExport />)} />
                  <Route path="/reset" element={owner(<Reset />)} />
                </Route>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
