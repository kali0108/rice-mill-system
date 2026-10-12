import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function StatusScreen({ title, body, onSignOut, onRetry }) {
  return (
    <div className="status-screen">
      <div className="status-card">
        <h1>{title}</h1>
        <p>{body}</p>
        <div className="form-actions" style={{ justifyContent: 'center' }}>
          {onRetry && <button type="button" className="btn primary" onClick={onRetry}>Dobara koshish</button>}
          <button type="button" className="btn" onClick={onSignOut}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children, requireRole }) {
  const { accessState, role, signOut, reloadProfile } = useAuth();

  if (accessState === 'loading') return <div className="boot-loading">Loading…</div>;
  if (accessState === 'signed-out') return <Navigate to="/login" replace />;
  if (accessState === 'pending') {
    return (
      <StatusScreen
        title="Approval ka intezar hai"
        body='Aap ka account maujood hai lekin Owner ne abhi koi role nahi diya. Owner "Users & Roles" page se role dega, us ke baad yahan "Dobara koshish" dabayein.'
        onSignOut={signOut}
        onRetry={reloadProfile}
      />
    );
  }
  if (accessState === 'suspended') {
    return (
      <StatusScreen
        title="Account suspend hai"
        body="Is account ki access Owner ne band ki hui hai. Ghalti se hua ho to Owner se rabta karein."
        onSignOut={signOut}
        onRetry={reloadProfile}
      />
    );
  }
  if (accessState === 'error') {
    return (
      <StatusScreen
        title="Server se rabta nahi ho saka"
        body="Aap ka account load nahi ho saka. Internet check kar ke dobara koshish karein."
        onSignOut={signOut}
        onRetry={reloadProfile}
      />
    );
  }
  if (requireRole && role !== requireRole) return <Navigate to="/dashboard" replace />;
  return children;
}
