import { useState } from 'react';
import { purchaseCalc, productionCalc, saleCalc, transportCalc, taxCalc, zakatCalc, fmt, rs } from '../lib/calc';
import { Panel } from '../components/ui';

function BasicCalculator() {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [overwrite, setOverwrite] = useState(true);

  function inputDigit(d) {
    if (overwrite) { setDisplay(d === '.' ? '0.' : d); setOverwrite(false); return; }
    if (d === '.' && display.includes('.')) return;
    setDisplay(display === '0' && d !== '.' ? d : display + d);
  }
  function clearAll() { setDisplay('0'); setPrev(null); setOp(null); setOverwrite(true); }
  function toggleSign() { setDisplay(String(parseFloat(display) * -1)); }
  function percent() { setDisplay(String(parseFloat(display) / 100)); }
  function compute(a, b, operator) {
    if (operator === '+') return a + b;
    if (operator === '−') return a - b;
    if (operator === '×') return a * b;
    if (operator === '÷') return b === 0 ? NaN : a / b;
    return b;
  }
  function chooseOp(nextOp) {
    const current = parseFloat(display);
    if (prev == null) setPrev(current);
    else if (!overwrite) { const result = compute(prev, current, op); setPrev(result); setDisplay(String(result)); }
    setOp(nextOp);
    setOverwrite(true);
  }
  function equals() {
    if (op == null || prev == null) return;
    const result = compute(prev, parseFloat(display), op);
    setDisplay(String(result));
    setPrev(null); setOp(null); setOverwrite(true);
  }

  const keys = [
    ['C', 'op'], ['±', 'op'], ['%', 'op'], ['÷', 'op-accent'],
    ['7', 'num'], ['8', 'num'], ['9', 'num'], ['×', 'op-accent'],
    ['4', 'num'], ['5', 'num'], ['6', 'num'], ['−', 'op-accent'],
    ['1', 'num'], ['2', 'num'], ['3', 'num'], ['+', 'op-accent'],
    ['0', 'num-wide'], ['.', 'num'], ['=', 'eq'],
  ];

  function press(k) {
    if (k === 'C') return clearAll();
    if (k === '±') return toggleSign();
    if (k === '%') return percent();
    if (k === '=') return equals();
    if (['+', '−', '×', '÷'].includes(k)) return chooseOp(k);
    return inputDigit(k);
  }

  return (
    <div className="calc-box">
      <div className="calc-display">{display}</div>
      <div className="calc-grid">
        {keys.map(([k, kind]) => (
          <button key={k} className={`calc-btn ${kind}`} onClick={() => press(k)}>{k}</button>
        ))}
      </div>
    </div>
  );
}

function QuickField({ label, value, onChange }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function PurchaseQuickCalc() {
  const [f, setF] = useState({ gross_wt: '', tare_wt: '', rate_per_maund: '', advance_applied: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const c = purchaseCalc(f);
  return (
    <Panel title="Paddy Purchase Calculator">
      <div className="form-grid">
        <QuickField label="Gross Weight (kg)" value={f.gross_wt} onChange={set('gross_wt')} />
        <QuickField label="Tare Weight (kg)" value={f.tare_wt} onChange={set('tare_wt')} />
        <QuickField label="Rate (Rs/maund)" value={f.rate_per_maund} onChange={set('rate_per_maund')} />
        <QuickField label="Advance to Adjust (Rs)" value={f.advance_applied} onChange={set('advance_applied')} />
      </div>
      <div className="calcline">Net Weight: <b>{fmt(c.netWt)} kg</b> &nbsp;|&nbsp; Amount: <b>{rs(c.amount)}</b> &nbsp;|&nbsp; Net Payable: <b>{rs(c.netPayable)}</b></div>
    </Panel>
  );
}

function RecoveryQuickCalc() {
  const [f, setF] = useState({ paddy_input_kg: '', rice_output_kg: '', kanki25: '', kanki50: '', kanki100: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const c = productionCalc(f);
  return (
    <Panel title="Recovery % Calculator">
      <div className="form-grid">
        <QuickField label="Paddy Input (kg)" value={f.paddy_input_kg} onChange={set('paddy_input_kg')} />
        <QuickField label="Rice Output — Full Grain (kg)" value={f.rice_output_kg} onChange={set('rice_output_kg')} />
        <QuickField label="Kanki 25% (kg)" value={f.kanki25} onChange={set('kanki25')} />
        <QuickField label="Kanki 50% (kg)" value={f.kanki50} onChange={set('kanki50')} />
        <QuickField label="Kanki 100% (kg)" value={f.kanki100} onChange={set('kanki100')} />
      </div>
      <div className="calcline">Total Usable Rice: <b>{fmt(c.totalRice)} kg</b> &nbsp;|&nbsp; Recovery %: <b>{c.recoveryPct.toFixed(1)}%</b></div>
    </Panel>
  );
}

function SaleQuickCalc() {
  const [f, setF] = useState({ qty_kg: '', rate: '', tax_pct: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const c = saleCalc(f);
  return (
    <Panel title="Sale Amount Calculator">
      <div className="form-grid">
        <QuickField label="Quantity (kg)" value={f.qty_kg} onChange={set('qty_kg')} />
        <QuickField label="Rate (Rs/kg)" value={f.rate} onChange={set('rate')} />
        <QuickField label="Tax %" value={f.tax_pct} onChange={set('tax_pct')} />
      </div>
      <div className="calcline">Amount: <b>{rs(c.amount)}</b> &nbsp;|&nbsp; Tax: <b>{rs(c.taxAmount)}</b> &nbsp;|&nbsp; Net Amount: <b>{rs(c.netAmount)}</b></div>
    </Panel>
  );
}

function TransportQuickCalc() {
  const [f, setF] = useState({ qty_kg: '', freight_rate_per_kg: '', commission_base_amount: '', commission_pct: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const c = transportCalc(f);
  return (
    <Panel title="Freight & Arhti Commission Calculator">
      <div className="form-grid">
        <QuickField label="Quantity (kg)" value={f.qty_kg} onChange={set('qty_kg')} />
        <QuickField label="Freight Rate (Rs/kg)" value={f.freight_rate_per_kg} onChange={set('freight_rate_per_kg')} />
        <QuickField label="Commission Base (Rs)" value={f.commission_base_amount} onChange={set('commission_base_amount')} />
        <QuickField label="Commission %" value={f.commission_pct} onChange={set('commission_pct')} />
      </div>
      <div className="calcline">Freight Amount: <b>{rs(c.freightAmount)}</b> &nbsp;|&nbsp; Commission Amount: <b>{rs(c.commissionAmount)}</b></div>
    </Panel>
  );
}

function TaxQuickCalc() {
  const [f, setF] = useState({ taxable_amount: '', tax_pct: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const c = taxCalc(f);
  const total = (Number(f.taxable_amount) || 0) + c.taxAmount;
  return (
    <Panel title="Tax (GST/Withholding) Calculator">
      <div className="form-grid">
        <QuickField label="Taxable Amount (Rs)" value={f.taxable_amount} onChange={set('taxable_amount')} />
        <QuickField label="Tax %" value={f.tax_pct} onChange={set('tax_pct')} />
      </div>
      <div className="calcline">Tax Amount: <b>{rs(c.taxAmount)}</b> &nbsp;|&nbsp; Total (Taxable + Tax): <b>{rs(total)}</b></div>
    </Panel>
  );
}

function ZakatQuickCalc() {
  const [f, setF] = useState({ cash_in_hand: '', bank_balance: '', stock_value: '', receivables: '', payables: '', nisab_threshold: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const c = zakatCalc(f);
  return (
    <Panel title="Zakat Quick Estimate">
      <div className="note" style={{ marginBottom: 10 }}>Sirf ek jaldi estimate — poora assessment save karne ke liye Tax &amp; Zakat page istemal karein.</div>
      <div className="form-grid">
        <QuickField label="Cash in Hand (Rs)" value={f.cash_in_hand} onChange={set('cash_in_hand')} />
        <QuickField label="Bank Balance (Rs)" value={f.bank_balance} onChange={set('bank_balance')} />
        <QuickField label="Stock Value (Rs)" value={f.stock_value} onChange={set('stock_value')} />
        <QuickField label="Receivables (Rs)" value={f.receivables} onChange={set('receivables')} />
        <QuickField label="Payables (Rs)" value={f.payables} onChange={set('payables')} />
        <QuickField label="Nisab Threshold (Rs)" value={f.nisab_threshold} onChange={set('nisab_threshold')} />
      </div>
      <div className="calcline">Zakatable Amount: <b>{rs(c.zakatable)}</b> &nbsp;|&nbsp; Zakat Due (2.5%): <b>{rs(c.due)}</b></div>
    </Panel>
  );
}

function MaundConverter() {
  const [maund, setMaund] = useState('');
  const [kg, setKg] = useState('');
  return (
    <Panel title="Maund ⇄ KG Converter">
      <div className="note" style={{ marginBottom: 10 }}>Is app mein 1 Maund = 40 kg use hota hai (Purchase module jaisa).</div>
      <div className="form-grid">
        <QuickField label="Maunds" value={maund} onChange={setMaund} />
        <div className="field"><label>= KG</label><input value={maund ? fmt(Number(maund) * 40) : ''} disabled placeholder="—" /></div>
        <QuickField label="KG" value={kg} onChange={setKg} />
        <div className="field"><label>= Maunds</label><input value={kg ? (Number(kg) / 40).toFixed(2) : ''} disabled placeholder="—" /></div>
      </div>
    </Panel>
  );
}

export default function Calculator() {
  return (
    <>
      <Panel title="Calculator">
        <BasicCalculator />
      </Panel>
      <MaundConverter />
      <PurchaseQuickCalc />
      <RecoveryQuickCalc />
      <SaleQuickCalc />
      <TransportQuickCalc />
      <TaxQuickCalc />
      <ZakatQuickCalc />
    </>
  );
}
