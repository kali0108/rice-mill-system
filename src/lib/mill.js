// Latest record per machine = its current status / next service date
export function machineStatus(rows) {
  const latest = new Map();
  rows.forEach((m) => {
    const cur = latest.get(m.machine);
    if (!cur || m.date > cur.date || (m.date === cur.date && String(m.created_at) > String(cur.created_at))) latest.set(m.machine, m);
  });
  return [...latest.values()];
}
