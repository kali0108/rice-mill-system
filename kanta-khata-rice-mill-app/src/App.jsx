import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Purchase from './pages/Purchase';
import Ledger from './pages/Ledger';
import Production from './pages/Production';
import Stock from './pages/Stock';
import Sales from './pages/Sales';
import Payments from './pages/Payments';
import Labor from './pages/Labor';
import Transport from './pages/Transport';
import Expenses from './pages/Expenses';
import Tax from './pages/Tax';
import Reports from './pages/Reports';
import Users from './pages/Users';
import ActivityLog from './pages/ActivityLog';
import Calculator from './pages/Calculator';
import ImportExport from './pages/ImportExport';
import Reset from './pages/Reset';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/purchase" element={<Purchase />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/production" element={<Production />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/labor" element={<Labor />} />
            <Route path="/transport" element={<Transport />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/tax" element={<Tax />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/calculator" element={<Calculator />} />
            <Route
              path="/import-export"
              element={
                <ProtectedRoute requireRole="owner">
                  <ImportExport />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reset"
              element={
                <ProtectedRoute requireRole="owner">
                  <Reset />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute requireRole="owner">
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/activity"
              element={
                <ProtectedRoute requireRole="owner">
                  <ActivityLog />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
