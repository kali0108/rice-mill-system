import { useMemo, useState } from 'react';
import { useRpc, WATCH } from '../hooks/useRpc';
import { useSupaTable } from '../hooks/useSupaTable';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/roles';
import { num, rs, r2 } from '../lib/calc';
import { todayStr, fmtDate } from '../lib/dates';
import { CASH_CATEGORIES, CASH_SOURCE_LABELS } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { printTable } from '../lib/print';
import { friendlyError } from '../lib/errors';
import { Panel, Field, NumInput, DateRangeBar, Empty, Badge, StatCard, FormActions, RowActions, PendingTag, confirmDelete, SyncNote } from '../components/ui';
import { T } from '../lib/i18n';

const blank = () => ({ date: todayStr(), category: 'Owner Capital', account: 'Cash', direction: 'In', amount: '', description: '' });

export default function CashBook() {
  const range = useDateRange('cashbook', 'today');
  const from = range.from || '2000-01-01';
  const to = range.to || '2100-12-31';
  const book = useRpc('get_cash_book', { p_from: from, p_to: to }, { watch: WATCH.cash });
  const opening = useRpc('get_cash_balances', { p_before: from }, { watch: WATCH.cash });
  const current = useRpc('get_cash_balances', { p_before: null }, { watch: WATCH.cash });
  const entries = useSupaTable('cash_entries', { from: range.from, to: range.to });
  const { profile } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const writable = can(profile, 'cashbook', 'add');
  const canEdit = can(profile, 'cashbook', 'edit');
  const canDel = can(profile, 'cashbook', 'delete');

  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [accountFilter, setAccountFilter] = useState('all');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const cat = CASH_CATEGORIES.find((c) => c.value === form.category) || {};

  const openBal = useMemo(() => {
    const m = { Cash: 0, Bank: 0 };
    if (range.from) (opening.data || []).forEach((b) => { m[b.account] = Number(b.balance); });
    return m;
  }, [opening.data, range.from]);
  const nowBal = useMemo(() => {
    const m = { Cash: 0, Bank: 0 };
    (current.data || []).forEach((b) => { m[b.account] = Number(b.balance); });
    return m;
  }, [current.data]);

  const moves = useMemo(() => book.data || [], [book.data]);
  const totals = useMemo(() => {
    const t = { Cash: { in: 0, out: 0 }, Bank: { in: 0, out: 0 } };
    moves.forEach((m) => {
      const a = t[m.account] || (t[m.account] = { in: 0, out: 0 });
      if (m.direction === 'In') a.in += Number(m.amount); else a.out += Number(m.amount);
    });
    return t;
  }, [moves]);
  const closing = {
    Cash: r2(openBal.Cash + totals.Cash.in - totals.Cash.out),
    Bank: r2(openBal.Bank + totals.Bank.in - totals.Bank.out),
  };
  const shown = moves.filter((m) => accountFilter === 'all' || m.account === accountFilter);

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    const amount = num(form.amount);
    if (amount <= 0) return toast.error(T("Raqam likhein."));
    const payload = {
      date: form.date, category: form.category, amount, description: form.description.trim(),
      account: cat.transfer ? (form.category === 'Cash to Bank' ? 'Cash' : 'Bank') : form.account,
      direction: cat.transfer ? 'Out' : cat.dir || form.direction,
    };
    setSaving(true);
    const res = editingId ? await entries.update(editingId, payload) : await entries.insert(payload);
    setSaving(false);
    if (res.error) return toast.error(T("Save nahi hua: ") + friendlyError(res.error));
    toast.success(res.queued ? T("Offline save — sync baad mein hogi.") : T("Cash entry save ho gayi."));
    setEditingId(null);
    setForm(blank());
  }

  async function del(c) {
    if (!confirmDelete(`${c.category} — ${rs(c.amount)}`)) return;
    const res = await entries.remove(c.id);
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success(T("Entry delete ho gayi."));
  }

  function printDay() {
    printTable({
      title: T("Rokar / Cash Book"),
      subtitle: `${range.from ? fmtDate(range.from) : T("Shuru")} — ${range.to ? fmtDate(range.to) : T("Aaj")}`,
      columns: [{ label: T("Date") }, { label: T("Khaata") }, { label: T("Source") }, { label: T("Party") }, { label: T("Tafseel") }, { label: T("Aamad (In)"), right: true }, { label: T("Kharch (Out)"), right: true }],
      rows: [
        ['', T("Cash"), '', '', T("Opening balance"), rs(openBal.Cash), ''],
        ['', T("Bank"), '', '', T("Opening balance"), rs(openBal.Bank), ''],
        ...shown.map((m) => [fmtDate(m.date), m.account, CASH_SOURCE_LABELS[m.source] || m.source, m.party || '', m.description,
          m.direction === 'In' ? rs(m.amount) : '', m.direction === 'Out' ? rs(m.amount) : '']),
      ],
      totals: ['', '', '', '', `${T("Closing — Cash ")}${rs(closing.Cash)}${T(" · Bank ")}${rs(closing.Bank)}`, rs(totals.Cash.in + totals.Bank.in), rs(totals.Cash.out + totals.Bank.out)],
    }, settings);
  }

  return (
    <>
      <div className="cardgrid">
        <StatCard n={rs(nowBal.Cash)} l={T("Cash in hand (abhi)")} warn={nowBal.Cash < 0} />
        <StatCard n={rs(nowBal.Bank)} l={T("Bank balance (abhi)")} warn={nowBal.Bank < 0} />
        <StatCard n={rs(nowBal.Cash + nowBal.Bank)} l={T("Kul (Cash + Bank)")} />
      </div>

      <Panel
        title={T("Rokar — Aamad o Kharch")}
        action={<>
          <SyncNote lastSynced={book.lastSynced} offline={book.offline} error={book.error} />
          <button type="button" className="btn small" onClick={printDay}>{T("Print")}</button>
          <button type="button" className="btn small" onClick={() => exportCSV('cashbook.csv', ['Date', 'Account', 'Direction', 'Amount', 'Source', 'Party', 'Description'],
            shown.map((m) => [m.date, m.account, m.direction, m.amount, m.source, m.party, m.description]))}>{T("CSV")}</button>
        </>}
      >
        <DateRangeBar range={range}>
          <Field label={T("Khaata")}>
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
              <option value="all">{T("Cash + Bank")}</option><option value="Cash">{T("Sirf Cash")}</option><option value="Bank">{T("Sirf Bank")}</option>
            </select>
          </Field>
        </DateRangeBar>
        <div className="tablewrap">
          <table className="data compact">
            <thead><tr><th></th><th className="r">{T("Opening")}</th><th className="r">{T("Aamad (In)")}</th><th className="r">{T("Kharch (Out)")}</th><th className="r">{T("Closing")}</th></tr></thead>
            <tbody>
              {['Cash', 'Bank'].map((a) => (
                <tr key={a}>
                  <td><b>{a}</b></td><td className="r">{rs(openBal[a])}</td><td className="r">{rs(totals[a].in)}</td>
                  <td className="r">{rs(totals[a].out)}</td><td className="r"><b>{rs(closing[a])}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Date")}</th><th>{T("Khaata")}</th><th>{T("Source")}</th><th>{T("Party")}</th><th>{T("Tafseel")}</th><th className="r">{T("Aamad")}</th><th className="r">{T("Kharch")}</th></tr></thead>
            <tbody>
              {book.loading && !moves.length ? <Empty colSpan={7} text={T("Loading…")} /> : shown.length ? shown.map((m, i) => (
                <tr key={`${m.source}-${m.ref_id}-${m.account}-${m.direction}-${i}`}>
                  <td>{fmtDate(m.date)}</td>
                  <td>{m.account}</td>
                  <td><Badge kind="zero">{CASH_SOURCE_LABELS[m.source] || m.source}</Badge></td>
                  <td>{m.party || '—'}</td>
                  <td className="wrap">{m.description}</td>
                  <td className="r">{m.direction === 'In' ? rs(m.amount) : ''}</td>
                  <td className="r">{m.direction === 'Out' ? rs(m.amount) : ''}</td>
                </tr>
              )) : <Empty colSpan={7} text={T("Is muddat mein koi len-den nahi.")} />}
            </tbody>
          </table>
        </div>
        <div className="note">{T("Rokar khud banta hai: Payments (Cash/Bank/clear cheque), kharid par mauqa adaigi, sale par wasooli, Cash/Bank kharche, machine repair, transport, mazdoori adaigi aur Zakat. Udhaar wale kharche yahan nahi — woh party ke khata mein jaate hain.")}</div>
      </Panel>

      {(writable || (editingId && canEdit)) && (
        <Panel title={editingId ? T("Cash Entry Edit Karein") : T("Doosri Cash Entry (capital, nikasi, bank transfer, qarz, kanta fee…)")}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label={T("Tareekh")}><input type="date" value={form.date} onChange={set('date')} required /></Field>
              <Field label={T("Qisam")}>
                <select value={form.category} onChange={set('category')}>
                  {CASH_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                </select>
              </Field>
              {!cat.transfer && (
                <Field label={T("Khaata")}>
                  <select value={form.account} onChange={set('account')}><option value="Cash">{T("Cash")}</option><option value="Bank">{T("Bank")}</option></select>
                </Field>
              )}
              {!cat.transfer && !cat.dir && (
                <Field label={T("Aamad / Kharch")}>
                  <select value={form.direction} onChange={set('direction')}><option value="In">{T("Aamad (In / +)")}</option><option value="Out">{T("Kharch (Out / −)")}</option></select>
                </Field>
              )}
              <Field label={T("Raqam (Rs)")}><NumInput value={form.amount} onChange={set('amount')} required /></Field>
              <Field label={T("Tafseel")} wide><input value={form.description} onChange={set('description')} /></Field>
            </div>
            {cat.transfer && <div className="note">{form.category === 'Cash to Bank' ? T("Cash se nikal kar bank mein jama.") : T("Bank se nikal kar cash mein.")}{T(" Dono khaate khud update honge.")}</div>}
            <FormActions saving={saving} editing={!!editingId} onCancel={() => { setEditingId(null); setForm(blank()); }} saveLabel={T("Entry Save Karein")} />
          </form>
        </Panel>
      )}

      <Panel title={T("Doosri Cash Entries (is muddat)")}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Date")}</th><th>{T("Qisam")}</th><th>{T("Khaata")}</th><th className="r">{T("Raqam")}</th><th>{T("Tafseel")}</th><th></th></tr></thead>
            <tbody>
              {entries.rows.length ? entries.rows.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDate(c.date)} {c._pending && <PendingTag />}</td>
                  <td>{c.category}</td>
                  <td>{c.category === 'Cash to Bank' ? T("Cash → Bank") : c.category === 'Bank to Cash' ? T("Bank → Cash") : `${c.account} (${c.direction === 'In' ? '+' : '−'})`}</td>
                  <td className="r">{rs(c.amount)}</td>
                  <td>{c.description || '—'}</td>
                  <td>
                    <RowActions
                      onEdit={canEdit ? () => { setEditingId(c.id); setForm({ date: c.date, category: c.category, account: c.account, direction: c.direction, amount: String(c.amount), description: c.description || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null}
                      onDelete={canDel ? () => del(c) : null}
                    />
                  </td>
                </tr>
              )) : <Empty colSpan={6} text={T("Koi entry nahi.")} />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
