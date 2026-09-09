import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function StatusScreen({ kind, onSignOut }) {
  const copy = {
    pending: {
      title: 'Approval ka intezar hai',
      body: 'Aapka account ban gaya hai lekin abhi Owner ne approve nahi kiya. Owner se baat karein — wo aapko "Users & Roles" page se role assign kar sakte hain, uske baad aap seedha login kar ke access hasil kar lenge.',
    },
    suspended: {
      title: 'Account suspend hai',
      body: 'Is account ki access Owner ne rok di hai. Agar yeh ghalti se hua hai to Owner/Admin se rabta karein.',
    },
  }[kind];
  return (
    <div className="status-screen">
      <div className="status-card">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <button className="btn" onClick={onSignOut}>Sign Out</button>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children, requireRole }) {
  const { session, role, accessState, loading, signOut } = useAuth();

  if (loading) return <div className="boot-loading">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (accessState === 'pending') return <StatusScreen kind="pending" onSignOut={signOut} />;
  if (accessState === 'suspended') return <StatusScreen kind="suspended" onSignOut={signOut} />;
  if (requireRole && role !== requireRole) return <Navigate to="/dashboard" replace />;
  return children;
}
