// Supabase returns at most 1000 rows per request (the project's "max rows"
// setting). The old app read every table with a single select('*'), so once a
// table passed 1000 rows, balances, reports and even the Full Backup silently
// lost data. This reads page by page until it has every row.
//
// build(withCount) must return a fresh, fully filtered + ordered query.
export async function fetchAll(build, { pageSize = 1000, maxPages = 1000 } = {}) {
  const rows = [];
  const seen = new Set();
  let total = null;
  let from = 0;
  for (let page = 0; page < maxPages; page++) {
    const { data, error, count, status } = await build(page === 0).range(from, from + pageSize - 1);
    if (error) return { data: null, error, status };
    if (page === 0 && typeof count === 'number') total = count;
    const batch = data || [];
    for (const r of batch) {
      const k = r && r.id != null ? String(r.id) : null;
      if (k === null || !seen.has(k)) {
        if (k !== null) seen.add(k);
        rows.push(r);
      }
    }
    if (batch.length === 0) break;
    from += batch.length;
    if (total !== null ? from >= total : batch.length < pageSize) break;
  }
  return { data: rows, error: null, status: 200 };
}
