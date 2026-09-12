import { useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { taxCalc, zakatCalc, rs, fmtDate, todayStr } from '../lib/calc';
import { exportCSV } from '../lib/csv';
import { Panel, Badge, Empty, PendingTag, StatCard } from '../components/ui';

const TAX_TYPES = ['Sales Tax/GST', 'Withholding Tax'];
const emptyTax = { date: todayStr(), tax_type: 'Sales Tax/GST', reference: '', taxable_amount: '', tax_pct: '', status: 'Pending', notes: '' };
const emptyZakat = { assessment_date: todayStr(), cash_in_hand: '0', bank_balance: '0', stock_value: '0', receivables: '0', payables: '0', nisab_threshold: '', notes: '' };

function taxToForm(r) {
  return { date: r.date, tax_type: r.tax_type, reference: r.reference || '', taxable_amount: String(r.taxable_amount), tax_pct: String(r.tax_pct), status: r.status, notes: r.notes || '' };
}
function zakatToForm(z) {
  return {
    assessment_date: z.assessment_date, cash_in_hand: String(z.cash_in_hand ?? 0), bank_balance: String(z.bank_balance ?? 0),
    stock_value: String(z.stock_value ?? 0), receivables: String(z.receivables ?? 0), payables: String(z.payables ?? 0),
    nisab_threshold: String(z.nisab_threshold ?? 0), notes: z.notes || '',
  };
}

export default function Tax() {
  const tax = useSupaTable('tax_records');
  const zakat = useSupaTable('zakat_assessments', { orderBy: 'assessment_date' });
  const sales = useSupaTable('sales');
  const { profile } = useAuth();
  const writableTax = canWrite(profile, 'tax');
  const writableZakat = canWrite(profile, 'zakat');

  const [tForm, setTForm] = useState(emptyTax);
  const [tEditingId, setTEditingId] = useState(null);
  const [zForm, setZForm] = useState(emptyZakat);
  const [zEditingId, setZEditingId] = useState(null);
  const setT = (k) => (e) => setTForm((f) => ({ ...f, [k]: e.target.value }));
  const setZ = (k) => (e) => setZForm((f) => ({ ...f, [k]: e.target.value }));

  const gstFromSales = sales.rows.reduce((s, x) => s + (Number(x.tax_amount) || 0), 0);
  const totalTaxFiled = tax.rows.filter((r) => r.status === 'Filed').reduce((s, r) => s + (Number(r.tax_amount) || 0), 0);
  const totalTaxPending = tax.rows.filter((r) => r.status === 'Pending').reduce((s, r) => s + (Number(r.tax_amount) || 0), 0);

  function startEditTax(r) { setTEditingId(r.id); setTForm(taxToForm(r)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function cancelEditTax() { setTEditingId(null); setTForm(emptyTax); }
  function startEditZakat(z) { setZEditingId(z.id); setZForm(zakatToForm(z)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function cancelEditZakat() { setZEditingId(null); setZForm(emptyZakat); }

  async function submitTax(e) {
    e.preventDefault();
    const { taxAmount } = taxCalc({ taxable_amount: tForm.taxable_amount, tax_pct: tForm.tax_pct });
    const payload = {
      date: tForm.date, tax_type: tForm.tax_type, reference: tForm.reference,
      taxable_amount: Number(tForm.taxable_amount) || 0, tax_pct: Number(tForm.tax_pct) || 0,
      tax_amount: taxAmount, status: tForm.status, notes: tForm.notes,
    };
    const { error } = tEditingId ? await tax.update(tEditingId, payload) : await tax.insert(payload);
    if (error) { alert('Save nahi hua: ' + error.message); return; }
    setTEditingId(null);
    setTForm(emptyTax);
  }

  async function submitZakat(e) {
    e.preventDefault();
    const { zakatable, due } = zakatCalc(zForm);
    const payload = {
      assessment_date: zForm.assessment_date, cash_in_hand: Number(zForm.cash_in_hand) || 0,
      bank_balance: Number(zForm.bank_balance) || 0, stock_value: Number(zForm.stock_value) || 0,
      receivables: Number(zForm.receivables) || 0, payables: Number(zForm.payables) || 0,
      nisab_threshold: Number(zForm.nisab_threshold) || 0, zakatable_amount: zakatable, zakat_due: due, notes: zForm.notes,
    };
    if (!zEditingId) payload.paid_amount = 0;
    const { error } = zEditingId ? await zakat.update(zEditingId, payload) : await zakat.insert(payload);
    if (error) { alert('Save nahi hua: ' + error.message); return; }
    setZEditingId(null);
    setZForm(emptyZakat);
  }

  const zPreview = zakatCalc(zForm);

  return (
    <>
      <div className="cardgrid">
        <StatCard n={rs(gstFromSales)} l="GST/Sales Tax Collected (from Sales invoices)" />
        <StatCard n={rs(totalTaxFiled)} l="Tax Filed" />
        <StatCard n={rs(totalTaxPending)} l="Tax Pending" warn={totalTaxPending > 0} />
      </div>

      {writableTax && (
        <Panel title={tEditingId ? 'Tax Record Edit Karein' : 'Tax Record — Sales Tax/GST or Withholding'}>
          <form onSubmit={submitTax}>
            <div className="form-grid">
              <div className="field"><label>Date</label><input type="date" value={tForm.date} onChange={setT('date')} required /></div>
              <div className="field"><label>Tax Type</label><select value={tForm.tax_type} onChange={setT('tax_type')}>{TAX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="field"><label>Reference (invoice/period)</label><input value={tForm.reference} onChange={setT('reference')} /></div>
              <div className="field"><label>Taxable Amount (Rs)</label><input type="number" min="0" value={tForm.taxable_amount} onChange={setT('taxable_amount')} required /></div>
              <div className="field"><label>Tax %</label><input type="number" step="0.1" min="0" value={tForm.tax_pct} onChange={setT('tax_pct')} required /></div>
              <div className="field"><label>Status</label><select value={tForm.status} onChange={setT('status')}><option value="Pending">Pending</option><option value="Filed">Filed</option></select></div>
              <div className="field"><label>Notes</label><input value={tForm.notes} onChange={setT('notes')} /></div>
            </div>
            <button type="submit" className="btn primary">{tEditingId ? 'Update Karein' : 'Tax Record Save Karein'}</button>{' '}
            {tEditingId && <button type="button" className="btn" onClick={cancelEditTax}>Cancel</button>}
          </form>
        </Panel>
      )}

      <Panel title="Tax Records" action={<button className="btn small" onClick={() => exportCSV('tax_records.csv', ['Date','Type','Reference','TaxableAmount','Tax%','TaxAmount','Status','Notes'], tax.rows.map((r) => [r.date, r.tax_type, r.reference, r.taxable_amount, r.tax_pct, r.tax_amount, r.status, r.notes]))}>Export CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Taxable Amt</th><th>Tax %</th><th>Tax Amount</th><th>Status</th>{writableTax && <th></th>}</tr></thead>
            <tbody>
              {tax.rows.length ? tax.rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)} {r._pending && <PendingTag />}</td><td>{r.tax_type}</td><td>{r.reference || '—'}</td>
                  <td>{rs(r.taxable_amount)}</td><td>{r.tax_pct}%</td><td><b>{rs(r.tax_amount)}</b></td>
                  <td>{r.status === 'Filed' ? <Badge kind="neg">Filed</Badge> : <Badge kind="pos">Pending</Badge>}</td>
                  {writableTax && <td><button className="btn small" onClick={() => startEditTax(r)}>Edit</button> <button className="btn small danger" onClick={() => tax.remove(r.id)}>Delete</button></td>}
                </tr>
              )) : <Empty colSpan={8} text="Koi tax record nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>

      {writableZakat && (
        <Panel title={zEditingId ? 'Zakat Assessment Edit Karein' : 'Zakat Assessment (Simplified Calculator)'}>
          <div className="calcline">
            Yeh ek <b>simplified</b> calculator hai — Zakatable Amount = Cash + Bank + Stock Value + Receivables − Payables.
            Agar yeh Nisab se zyada ho to <b>2.5%</b> Zakat ban'ti hai. Apne mill ke fiqh/mufti se nisab aur exact rules confirm zaroor karein — yeh dhaarmik fatwa nahi hai.
          </div>
          <form onSubmit={submitZakat}>
            <div className="form-grid">
              <div className="field"><label>Assessment Date</label><input type="date" value={zForm.assessment_date} onChange={setZ('assessment_date')} required /></div>
              <div className="field"><label>Cash in Hand (Rs)</label><input type="number" min="0" value={zForm.cash_in_hand} onChange={setZ('cash_in_hand')} /></div>
              <div className="field"><label>Bank Balance (Rs)</label><input type="number" min="0" value={zForm.bank_balance} onChange={setZ('bank_balance')} /></div>
              <div className="field"><label>Stock Value (Rs)</label><input type="number" min="0" value={zForm.stock_value} onChange={setZ('stock_value')} /></div>
              <div className="field"><label>Receivables (Rs)</label><input type="number" min="0" value={zForm.receivables} onChange={setZ('receivables')} /></div>
              <div className="field"><label>Payables (Rs)</label><input type="number" min="0" value={zForm.payables} onChange={setZ('payables')} /></div>
              <div className="field"><label>Nisab Threshold (Rs)</label><input type="number" min="0" value={zForm.nisab_threshold} onChange={setZ('nisab_threshold')} placeholder="apna current nisab yahan enter karein" required /></div>
              <div className="field"><label>Notes</label><input value={zForm.notes} onChange={setZ('notes')} /></div>
            </div>
            <div className="calcline">Zakatable Amount: <b>{rs(zPreview.zakatable)}</b> &nbsp; | &nbsp; Zakat Due (2.5%): <b>{rs(zPreview.due)}</b></div>
            <button type="submit" className="btn primary">{zEditingId ? 'Update Karein' : 'Assessment Save Karein'}</button>{' '}
            {zEditingId && <button type="button" className="btn" onClick={cancelEditZakat}>Cancel</button>}
          </form>
        </Panel>
      )}

      <Panel title="Zakat History">
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Zakatable Amount</th><th>Zakat Due</th><th>Paid Amount</th><th>Paid Date</th>{writableZakat && <th></th>}</tr></thead>
            <tbody>
              {zakat.rows.length ? zakat.rows.map((z) => (
                <tr key={z.id}>
                  <td>{fmtDate(z.assessment_date)} {z._pending && <PendingTag />}</td><td>{rs(z.zakatable_amount)}</td><td><b>{rs(z.zakat_due)}</b></td>
                  <td>
                    <input type="number" min="0" defaultValue={z.paid_amount || 0} disabled={!writableZakat}
                      style={{ width: 100, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px' }}
                      onBlur={(e) => writableZakat && zakat.update(z.id, { paid_amount: Number(e.target.value) || 0 })} />
                  </td>
                  <td>
                    <input type="date" defaultValue={z.paid_date || ''} disabled={!writableZakat}
                      style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px' }}
                      onBlur={(e) => writableZakat && zakat.update(z.id, { paid_date: e.target.value || null })} />
                  </td>
                  {writableZakat && <td><button className="btn small" onClick={() => startEditZakat(z)}>Edit</button> <button className="btn small danger" onClick={() => zakat.remove(z.id)}>Delete</button></td>}
                </tr>
              )) : <Empty colSpan={6} text="Koi zakat assessment nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
