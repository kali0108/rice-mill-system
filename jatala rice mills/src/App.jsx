import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import { isConfigured } from './lib/supabaseClient';

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
        <h1>Setup adhoora hai</h1>
        <p>
          Supabase ka <b>VITE_SUPABASE_URL</b> aur <b>VITE_SUPABASE_ANON_KEY</b> set nahi hain.
          Local computer par <code>.env.local</code> file mein, ya Vercel par Project Settings → Environment Variables
          mein yeh dono daalein, phir dobara build/deploy karein. Poora tareeqa DEPLOYMENT_GUIDE.md mein hai.
        </p>
      </div>
    </div>
  );
}

const owner = (el) => <ProtectedRoute requireRole="owner">{el}</ProtectedRoute>;

export default function App() {
  if (!isConfigured) return <SetupScreen />;
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<div className="boot-loading">Loading…</div>}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/purchase" element={<Purchase />} />
                  <Route path="/parties" element={<Parties />} />
                  <Route path="/statement" element={<Statement />} />
                  <Route path="/ledger" element={<Ledger />} />
                  <Route path="/payments" element={<Payments />} />
                  <Route path="/cashbook" element={<CashBook />} />
                  <Route path="/production" element={<Production />} />
                  <Route path="/stock" element={<Stock />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/contracts" element={<Contracts />} />
                  <Route path="/weighbridge" element={<Weighbridge />} />
                  <Route path="/drying" element={<Drying />} />
                  <Route path="/bags" element={<Bags />} />
                  <Route path="/sales" element={<Sales />} />
                  <Route path="/labor" element={<Labor />} />
                  <Route path="/transport" element={<Transport />} />
                  <Route path="/expenses" element={<Expenses />} />
                  <Route path="/tax" element={<Tax />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/calculator" element={<Calculator />} />
                  <Route path="/account" element={<Account />} />
                  <Route path="/users" element={owner(<Users />)} />
                  <Route path="/settings" element={owner(<Settings />)} />
                  <Route path="/activity" element={owner(<ActivityLog />)} />
                  <Route path="/import-export" element={owner(<ImportExport />)} />
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
