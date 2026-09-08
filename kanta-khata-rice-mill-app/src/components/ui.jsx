export function StatCard({ n, l, warn }) {
  return (
    <div className={`stat-card ${warn ? 'warn' : ''}`}>
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}

export function Panel({ title, action, children }) {
  return (
    <div className="panel">
      {(title || action) && (
        <div className="toprow">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Badge({ kind = 'zero', children }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

export function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Empty({ colSpan, text = 'Abhi koi entry nahi.' }) {
  return (
    <tr>
      <td colSpan={colSpan} className="empty">{text}</td>
    </tr>
  );
}

export function PendingTag() {
  return <span className="badge zero" title="Offline — sync hone ka intezar hai">Syncing…</span>;
}
