import { useMemo, useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useRpc, WATCH } from '../hooks/useRpc';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useParties } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { canWrite } from '../lib/roles';
import { taxCalc, zakatCalc, num, rs, sum, r2 } from '../lib/calc';
import { todayStr, fmtDate } from '../lib/dates';
import { TAX_TYPES } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { friendlyError } from '../lib/errors';
import { Panel, Field, NumInput, DateRangeBar, Empty, PendingTag, Badge, StatCard, FormActions, RowActions, confirmDelete } from '../components/ui';

const blankTax = () => ({ date: todayStr(), tax_type: 'Sales Tax/GST', reference: '', taxable_amount: '', tax_pct: '', status: 'Pending', notes: '' });
const blankZakat = () => ({ assessment_date: todayStr(), cash_in_hand: '', bank_balance: '', stock_value: '', receivables: '', payables: '', nisab_threshold: '', paid_amount: '', paid_date: '', notes: '' });

export default function Tax() {
  const range = useDateRange('tax', 'month');
  const tax = useSupaTable('tax_records', { from: range.from, to: range.to });
  const sales = useSupaTable('sales', { from: range.from, to: range.to });
  const zakat = useSupaTable('zakat_assessments', { orderBy: 'assessment_date' });
  const cash = useRpc('get_cash_balances', { p_before: null }, { watch: WATCH.cash });
  const stock = useRpc('get_stock_summary', {}, { watch: WATCH.stock });
  const { balances } = useParties();
  const { profile } = useAuth();
  const toast = useToast();
  const writableTax = canWrite(profile, 'tax');
  const writableZakat = canWrite(profile, 'zakat');

  const [tForm, setTForm] = useState(blankTax);
  const [tEditing, setTEditing] = useState(null);
  const [zForm, setZForm] = useState(blankZakat);
  const [zEditing, setZEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rates, setRates] = useState({});
  const setT = (k) => (e) => setTForm((f) => ({ ...f, [k]: e.target.value }));
  const setZ = (k) => (e) => setZForm((f) => ({ ...f, [k]: e.target.value }));

  const gst = sum(sales.rows, 'tax_amount');
  const taxable = sum(sales.rows.filter((s) => Number(s.tax_amount) > 0), 'amount');
  const pending = sum(tax.rows.filter((r) => r.status === 'Pending'), 'tax_amount');
  const zPreview = zakatCalc(zForm);
  const stockLines = useMemo(() => (stock.data || []).filter((s) => Number(s.balance_kg) > 0), [stock.data]);

  function fillFromSystem() {
    const c = { Cash: 0, Bank: 0 };
    (cash.data || []).forEach((b) => { c[b.account] = Number(b.balance); });
    const recv = Math.abs(sum(balances.filter((b) => Number(b.balance) < 0), 'balance'));
    const pay = sum(balances.filter((b) => Number(b.balance) > 0), 'balance');
    const stockValue = r2(stockLines.reduce((s, l) => s + Number(l.balance_kg) * num(rates[l.item + '|' + l.variety]), 0));
    setZForm((f) => ({
      ...f, cash_in_hand: String(Math.max(c.Cash, 0)), bank_balance: String(Math.max(c.Bank, 0)), receivables: String(recv),
      payables: String(pay), stock_value: stockValue ? String(stockValue) : f.stock_value,
    }));
    toast.info('Cash, bank, lene aur dene wali raqam system se bhar di gayi. Stock value rates se — check kar lein.');
  }

  async function saveTax(e) {
    e.preventDefault();
    if (saving) return;
    const payload = {
      date: tForm.date, tax_type: tForm.tax_type, reference: tForm.reference.trim(), taxable_amount: num(tForm.taxable_amount),
      tax_pct: num(tForm.tax_pct), tax_amount: taxCalc(tForm).taxAmount, status: tForm.status, notes: tForm.notes.trim(),
    };
    setSaving(true);
    const res = tEditing ? await tax.update(tEditing, payload) : await tax.insert(payload);
    setSaving(false);
    if (res.error) return toast.error('Save nahi hua: ' + friendlyError(res.error));
    toast.success('Tax record save ho gaya.');
    setTEditing(null);
    setTForm(blankTax());
  }

  async function saveZakat(e) {
    e.preventDefault();
    if (saving) return;
    if (num(zForm.nisab_threshold) <= 0) return toast.error('Nisab ki raqam likhein (apne aalim / bank se aaj ka nisab maloom karein).');
    const payload = {
      assessment_date: zForm.assessment_date, cash_in_hand: num(zForm.cash_in_hand), bank_balance: num(zForm.bank_balance),
      stock_value: num(zForm.stock_value), receivables: num(zForm.receivables), payables: num(zForm.payables),
      nisab_threshold: num(zForm.nisab_threshold), zakatable_amount: zPreview.zakatable, zakat_due: zPreview.due,
      paid_amount: num(zForm.paid_amount), paid_date: num(zForm.paid_amount) > 0 ? zForm.paid_date || todayStr() : null, notes: zForm.notes.trim(),
    };
    setSaving(true);
    const res = zEditing ? await zakat.update(zEditing, payload) : await zakat.insert(payload);
    setSaving(false);
    if (res.error) return toast.error('Save nahi hua: ' + friendlyError(res.error));
    toast.success('Zakat assessment save ho gaya.');
    setZEditing(null);
    setZForm(blankZakat());
  }

  async function del(table, row, label) {
    if (!confirmDelete(label)) return;
    const res = await table.remove(row.id);
    if (res.error) toast.error(friendlyError(res.error));
  }

  const s = (v) => (v == null || Number(v) === 0 ? '' : String(v));

  return (
    <>
      <div className="cardgrid">
        <StatCard n={rs(gst)} l="Sales tax / GST (sale bills, is muddat)" />
        <StatCard n={rs(taxable)} l="Taxable sale (is muddat)" />
        <StatCard n={rs(pending)} l="Tax pending (records)" warn={pending > 0} />
      </div>

      {writableTax && (
        <Panel title={tEditing ? 'Tax Record Edit' : 'Tax Record (GST / Withholding / Advance tax / Market fee)'}>
          <form onSubmit={saveTax}>
            <div className="form-grid">
              <Field label="Tareekh"><input type="date" value={tForm.date} onChange={setT('date')} required /></Field>
              <Field label="Qisam"><select value={tForm.tax_type} onChange={setT('tax_type')}>{TAX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
              <Field label="Reference (period / challan #)"><input value={tForm.reference} onChange={setT('reference')} /></Field>
              <Field label="Taxable raqam (Rs)"><NumInput value={tForm.taxable_amount} onChange={setT('taxable_amount')} required /></Field>
              <Field label="Tax %"><NumInput value={tForm.tax_pct} onChange={setT('tax_pct')} required /></Field>
              <Field label="Status"><select value={tForm.status} onChange={setT('status')}><option value="Pending">Pending</option><option value="Filed">Filed (return jama)</option><option value="Paid">Paid (ada)</option></select></Field>
              <Field label="Note" wide><input value={tForm.notes} onChange={setT('notes')} /></Field>
            </div>
            <div className="calcline">Tax: <b>{rs(taxCalc(tForm).taxAmount)}</b></div>
            <FormActions saving={saving} editing={!!tEditing} onCancel={() => { setTEditing(null); setTForm(blankTax()); }} saveLabel="Record Save" />
          </form>
        </Panel>
      )}

      <Panel title="Tax Records" action={<button type="button" className="btn small" onClick={() => exportCSV('tax_records.csv', ['Date', 'Type', 'Reference', 'Taxable', 'Tax%', 'Tax', 'Status', 'Notes'], tax.rows.map((r) => [r.date, r.tax_type, r.reference, r.taxable_amount, r.tax_pct, r.tax_amount, r.status, r.notes]))}>Export CSV</button>}>
        <DateRangeBar range={range} />
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Qisam</th><th>Reference</th><th className="r">Taxable</th><th className="r">%</th><th className="r">Tax</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {tax.rows.length ? tax.rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)} {r._pending && <PendingTag />}</td><td>{r.tax_type}</td><td>{r.reference || '—'}</td>
                  <td className="r">{rs(r.taxable_amount)}</td><td className="r">{r.tax_pct}%</td><td className="r"><b>{rs(r.tax_amount)}</b></td>
                  <td><Badge kind={r.status === 'Pending' ? 'pending' : 'cleared'}>{r.status}</Badge></td>
                  <td>
                    <RowActions
                      onEdit={writableTax ? () => { setTEditing(r.id); setTForm({ date: r.date, tax_type: r.tax_type, reference: r.reference || '', taxable_amount: String(r.taxable_amount), tax_pct: String(r.tax_pct), status: r.status, notes: r.notes || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null}
                      onDelete={writableTax ? () => del(tax, r, `${r.tax_type} ${rs(r.tax_amount)}`) : null}
                    />
                  </td>
                </tr>
              )) : <Empty colSpan={8} text="Is muddat mein koi tax record nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>

      {writableZakat && (
        <Panel title={zEditing ? 'Zakat Assessment Edit' : 'Zakat Assessment (aasaan hisaab)'}>
          <div className="calcline">
            Zakatable = Cash + Bank + Stock ki qeemat + Lene wali raqam − Dene wali raqam. Agar yeh Nisab se zyada ho to <b>2.5%</b>.
            Yeh sirf hisaab ki madad hai, fatwa nahi — nisab aur masail apne mufti / aalim se zaroor confirm karein.
          </div>
          {stockLines.length > 0 && (
            <details className="stock-rates">
              <summary>Stock ki qeemat lagane ke liye rates (optional)</summary>
              <div className="form-grid">
                {stockLines.map((l) => (
                  <Field key={l.item + '|' + l.variety} label={`${l.item}${l.variety ? ' — ' + l.variety : ''} (${Math.round(l.balance_kg)} kg) — Rs/kg`}>
                    <NumInput value={rates[l.item + '|' + l.variety] || ''} onChange={(e) => setRates((r) => ({ ...r, [l.item + '|' + l.variety]: e.target.value }))} />
                  </Field>
                ))}
              </div>
            </details>
          )}
          <form onSubmit={saveZakat}>
            <div className="form-grid">
              <Field label="Tareekh"><input type="date" value={zForm.assessment_date} onChange={setZ('assessment_date')} required /></Field>
              <Field label="Cash (Rs)"><NumInput value={zForm.cash_in_hand} onChange={setZ('cash_in_hand')} /></Field>
              <Field label="Bank (Rs)"><NumInput value={zForm.bank_balance} onChange={setZ('bank_balance')} /></Field>
              <Field label="Stock ki qeemat (Rs)"><NumInput value={zForm.stock_value} onChange={setZ('stock_value')} /></Field>
              <Field label="Lene wali raqam (Rs)"><NumInput value={zForm.receivables} onChange={setZ('receivables')} /></Field>
              <Field label="Dene wali raqam (Rs)"><NumInput value={zForm.payables} onChange={setZ('payables')} /></Field>
              <Field label="Nisab (Rs)"><NumInput value={zForm.nisab_threshold} onChange={setZ('nisab_threshold')} required placeholder="aaj ka nisab" /></Field>
              <Field label="Ada ki (Rs)"><NumInput value={zForm.paid_amount} onChange={setZ('paid_amount')} /></Field>
              <Field label="Ada ki tareekh"><input type="date" value={zForm.paid_date} onChange={setZ('paid_date')} /></Field>
              <Field label="Note" wide><input value={zForm.notes} onChange={setZ('notes')} /></Field>
            </div>
            <div className="calcline">Zakatable: <b>{rs(zPreview.zakatable)}</b> · Zakat (2.5%): <b>{rs(zPreview.due)}</b></div>
            <FormActions
              saving={saving}
              editing={!!zEditing}
              onCancel={() => { setZEditing(null); setZForm(blankZakat()); }}
              saveLabel="Assessment Save"
              extra={<button type="button" className="btn" onClick={fillFromSystem}>System se bharein</button>}
            />
          </form>
        </Panel>
      )}

      <Panel title="Zakat History">
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th className="r">Zakatable</th><th className="r">Zakat</th><th className="r">Ada</th><th>Ada ki tareekh</th><th className="r">Baqi</th><th></th></tr></thead>
            <tbody>
              {zakat.rows.length ? zakat.rows.map((z) => (
                <tr key={z.id}>
                  <td>{fmtDate(z.assessment_date)} {z._pending && <PendingTag />}</td>
                  <td className="r">{rs(z.zakatable_amount)}</td><td className="r"><b>{rs(z.zakat_due)}</b></td>
                  <td className="r">{rs(z.paid_amount)}</td><td>{z.paid_date ? fmtDate(z.paid_date) : '—'}</td>
                  <td className="r">{rs(Math.max(Number(z.zakat_due) - Number(z.paid_amount || 0), 0))}</td>
                  <td>
                    <RowActions
                      onEdit={writableZakat ? () => { setZEditing(z.id); setZForm({ assessment_date: z.assessment_date, cash_in_hand: s(z.cash_in_hand), bank_balance: s(z.bank_balance), stock_value: s(z.stock_value), receivables: s(z.receivables), payables: s(z.payables), nisab_threshold: s(z.nisab_threshold), paid_amount: s(z.paid_amount), paid_date: z.paid_date || '', notes: z.notes || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null}
                      onDelete={writableZakat ? () => del(zakat, z, `Zakat ${fmtDate(z.assessment_date)}`) : null}
                    />
                  </td>
                </tr>
              )) : <Empty colSpan={7} text="Koi zakat assessment nahi." />}
            </tbody>
          </table>
        </div>
        <div className="note">Zakat ki adaigi (raqam + tareekh) Cash Book mein &quot;Zakat adaigi&quot; ke taur par khud darj ho jati hai.</div>
      </Panel>
    </>
  );
}
