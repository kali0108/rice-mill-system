import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdmin, canOpenRoute } from '../lib/roles';
import { T } from '../lib/i18n';

function StatusScreen({ title, body, onSignOut, onRetry }) {
  return (
    <div className="status-screen">
      <div className="status-card">
        <h1>{title}</h1>
        <p>{body}</p>
        <div className="form-actions" style={{ justifyContent: 'center' }}>
          {onRetry && <button type="button" className="btn primary" onClick={onRetry}>{T("Dobara koshish")}</button>}
          <button type="button" className="btn" onClick={onSignOut}>{T("Sign Out")}</button>
        </div>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children, requireRole, requireAdmin, path }) {
  const { accessState, role, profile, signOut, reloadProfile } = useAuth();

  if (accessState === 'loading') return <div className="boot-loading">{T("Loading…")}</div>;
  if (accessState === 'signed-out') return <Navigate to="/login" replace />;
  if (accessState === 'pending') {
    return (
      <StatusScreen
        title={T("Approval ka intezar hai")}
        body='Aap ka account maujood hai lekin Owner ne abhi koi role nahi diya. Owner "Users & Roles" page se role dega, us ke baad yahan "Dobara koshish" dabayein.'
        onSignOut={signOut}
        onRetry={reloadProfile}
      />
    );
  }
  if (accessState === 'suspended') {
    return (
      <StatusScreen
        title={T("Account suspend hai")}
        body="Is account ki access Owner ne band ki hui hai. Ghalti se hua ho to Owner se rabta karein."
        onSignOut={signOut}
        onRetry={reloadProfile}
      />
    );
  }
  if (accessState === 'error') {
    return (
      <StatusScreen
        title={T("Server se rabta nahi ho saka")}
        body="Aap ka account load nahi ho saka. Internet check kar ke dobara koshish karein."
        onSignOut={signOut}
        onRetry={reloadProfile}
      />
    );
  }
  if (requireRole && role !== requireRole) return <Navigate to="/dashboard" replace />;
  if (requireAdmin && !isAdmin(profile)) return <Navigate to="/dashboard" replace />;
  if (path && !canOpenRoute(profile, path)) {
    return (
      <div className="panel">
        <h2>{T("Ijazat nahi")}</h2>
        <p className="note">{T("Aap ko yeh hissa dekhne ki ijazat nahi. Zaroorat ho to Owner ya Manager se kahein (Users & Roles → Permissions).")}</p>
      </div>
    );
  }
  return children;
}
