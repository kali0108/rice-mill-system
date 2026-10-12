import { useEffect, useState } from 'react';
import { purchaseCalc, productionCalc, saleCalc, transportCalc, taxCalc, zakatCalc, deductionKg, fmt, fmtNum, rs, pct, num } from '../lib/calc';
import { Panel, Field, NumInput } from '../components/ui';

function clean(n) {
  if (!Number.isFinite(n)) return 'Error';
  return String(parseFloat(n.toPrecision(12)));
}

function BasicCalculator() {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [overwrite, setOverwrite] = useState(true);

  function compute(a, b, o) {
    if (o === '+') return a + b;
    if (o === '−') return a - b;
    if (o === '×') return a * b;
    if (o === '÷') return b === 0 ? NaN : a / b;
    return b;
  }
  function press(k) {
    if (k === 'C') { setDisplay('0'); setPrev(null); setOp(null); setOverwrite(true); return; }
    if (display === 'Error' && !/\d/.test(k)) return;
    if (k === '⌫') { if (!overwrite) setDisplay((d) => (d.length > 1 ? d.slice(0, -1) : '0')); return; }
    if (k === '±') { setDisplay((d) => clean(-parseFloat(d))); return; }
    if (k === '%') { setDisplay((d) => clean(parseFloat(d) / 100)); return; }
    if (['+', '−', '×', '÷'].includes(k)) {
      const cur = parseFloat(display);
      if (prev == null) setPrev(cur);
      else if (!overwrite) { const r = compute(prev, cur, op); setPrev(r); setDisplay(clean(r)); }
      setOp(k);
      setOverwrite(true);
      return;
    }
    if (k === '=') {
      if (op == null || prev == null) return;
      const r = compute(prev, parseFloat(display), op);
      setDisplay(clean(r));
      setPrev(null); setOp(null); setOverwrite(true);
      return;
    }
    // digit or dot
    if (overwrite || display === 'Error') { setDisplay(k === '.' ? '0.' : k); setOverwrite(false); return; }
    if (k === '.' && display.includes('.')) return;
    setDisplay(display === '0' && k !== '.' ? k : display + k);
  }

  useEffect(() => {
    const map = { '+': '+', '-': '−', '*': '×', '/': '÷', Enter: '=', '=': '=', Escape: 'C', Backspace: '⌫', '%': '%', '.': '.' };
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); } else if (map[e.key]) { e.preventDefault(); press(map[e.key]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const keys = [['C', 'op'], ['⌫', 'op'], ['%', 'op'], ['÷', 'op-accent'], ['7', 'num'], ['8', 'num'], ['9', 'num'], ['×', 'op-accent'],
    ['4', 'num'], ['5', 'num'], ['6', 'num'], ['−', 'op-accent'], ['1', 'num'], ['2', 'num'], ['3', 'num'], ['+', 'op-accent'],
    ['±', 'num'], ['0', 'num'], ['.', 'num'], ['=', 'eq']];
  return (
    <div className="calc-box">
      <div className="calc-display">{op && prev != null ? <span className="calc-pending">{clean(prev)} {op}</span> : null}{display}</div>
      <div className="calc-grid">
        {keys.map(([k, kind]) => <button type="button" key={k} className={`calc-btn ${kind}`} onClick={() => press(k)}>{k}</button>)}
      </div>
    </div>
  );
}

function useFields(init) {
  const [f, setF] = useState(init);
  return [f, (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))];
}

function Q({ label, value, onChange }) {
  return <Field label={label}><NumInput value={value} onChange={onChange} /></Field>;
}

export default function Calculator() {
  const [m, setM] = useFields({ maund: '', kg: '', rateMaund: '', rateKg: '' });
  const [p, setP] = useFields({ gross_wt: '', tare_wt: '', bags: '', bag_wt_kg: '', katoti: '', rate_per_maund: '', commission_pct: '', labor_charges: '', advance_applied: '' });
  const [r, setR] = useFields({ paddy_input_kg: '', rice_output_kg: '', kanki25: '', kanki50: '', kanki100: '' });
  const [s, setS] = useFields({ qty_kg: '', rate: '', tax_pct: '' });
  const [t, setT] = useFields({ qty_kg: '', freight_rate_per_kg: '', commission_base_amount: '', commission_pct: '' });
  const [x, setX] = useFields({ taxable_amount: '', tax_pct: '' });
  const [z, setZ] = useFields({ cash_in_hand: '', bank_balance: '', stock_value: '', receivables: '', payables: '', nisab_threshold: '' });

  const afterBardana = num(p.gross_wt) - num(p.tare_wt) - num(p.bags) * num(p.bag_wt_kg);
  const pc = purchaseCalc({ ...p, deduction_kg: deductionKg('per_maund', p.katoti, afterBardana) });
  const rc = productionCalc(r);
  const sm = saleCalc({ ...s, rate_unit: 'maund' });
  const tc = transportCalc(t);
  const xc = taxCalc(x);
  const zc = zakatCalc(z);

  return (
    <>
      <Panel title="Calculator"><BasicCalculator /></Panel>

      <Panel title="Maund ⇄ KG aur Rate converter (1 maund = 40 kg)">
        <div className="form-grid">
          <Q label="Maund" value={m.maund} onChange={setM('maund')} />
          <Field label="= KG"><input readOnly value={m.maund ? fmtNum(num(m.maund) * 40) : ''} placeholder="—" /></Field>
          <Q label="KG" value={m.kg} onChange={setM('kg')} />
          <Field label="= Maund"><input readOnly value={m.kg ? fmt(num(m.kg) / 40, 3) : ''} placeholder="—" /></Field>
          <Q label="Rate fi maund (Rs)" value={m.rateMaund} onChange={setM('rateMaund')} />
          <Field label="= Rate fi kg"><input readOnly value={m.rateMaund ? fmt(num(m.rateMaund) / 40, 2) : ''} placeholder="—" /></Field>
          <Q label="Rate fi kg (Rs)" value={m.rateKg} onChange={setM('rateKg')} />
          <Field label="= Rate fi maund"><input readOnly value={m.rateKg ? fmt(num(m.rateKg) * 40, 2) : ''} placeholder="—" /></Field>
        </div>
      </Panel>

      <Panel title="Paddy kharid ka hisaab">
        <div className="form-grid">
          <Q label="Gross (kg)" value={p.gross_wt} onChange={setP('gross_wt')} />
          <Q label="Tare (kg)" value={p.tare_wt} onChange={setP('tare_wt')} />
          <Q label="Bags" value={p.bags} onChange={setP('bags')} />
          <Q label="Bardana katoti fi bag (kg)" value={p.bag_wt_kg} onChange={setP('bag_wt_kg')} />
          <Q label="Namee katoti (kg fi maund)" value={p.katoti} onChange={setP('katoti')} />
          <Q label="Rate (Rs fi maund)" value={p.rate_per_maund} onChange={setP('rate_per_maund')} />
          <Q label="Commission %" value={p.commission_pct} onChange={setP('commission_pct')} />
          <Q label="Mazdoori katoti (Rs)" value={p.labor_charges} onChange={setP('labor_charges')} />
          <Q label="Mauqa par adaigi (Rs)" value={p.advance_applied} onChange={setP('advance_applied')} />
        </div>
        <div className="calcline">Net: <b>{fmtNum(pc.netWt)} kg ({fmt(pc.maunds, 2)} md)</b> · Raqam: <b>{rs(pc.amount)}</b> · Commission: {rs(pc.commission)} · Kul: <b>{rs(pc.total)}</b> · Baqaya: <b>{rs(pc.netPayable)}</b></div>
      </Panel>

      <Panel title="Recovery %">
        <div className="form-grid">
          <Q label="Paddy (kg)" value={r.paddy_input_kg} onChange={setR('paddy_input_kg')} />
          <Q label="Full grain (kg)" value={r.rice_output_kg} onChange={setR('rice_output_kg')} />
          <Q label="Kanki 25% (kg)" value={r.kanki25} onChange={setR('kanki25')} />
          <Q label="Kanki 50% (kg)" value={r.kanki50} onChange={setR('kanki50')} />
          <Q label="Kanki 100% (kg)" value={r.kanki100} onChange={setR('kanki100')} />
        </div>
        <div className="calcline">Kul chawal: <b>{fmtNum(rc.totalRice)} kg</b> · Recovery: <b>{pct(rc.recoveryPct)}</b> · Head rice: <b>{pct(rc.fullGrainPct)}</b></div>
      </Panel>

      <Panel title="Sale (rate fi maund)">
        <div className="form-grid">
          <Q label="Wazan (kg)" value={s.qty_kg} onChange={setS('qty_kg')} />
          <Q label="Rate (Rs fi maund)" value={s.rate} onChange={setS('rate')} />
          <Q label="Tax %" value={s.tax_pct} onChange={setS('tax_pct')} />
        </div>
        <div className="calcline">{fmt(sm.maunds, 2)} maund · Raqam: <b>{rs(sm.amount)}</b> · Tax: {rs(sm.taxAmount)} · Kul: <b>{rs(sm.netAmount)}</b></div>
      </Panel>

      <Panel title="Kiraya & Commission">
        <div className="form-grid">
          <Q label="Wazan (kg)" value={t.qty_kg} onChange={setT('qty_kg')} />
          <Q label="Kiraya (Rs/kg)" value={t.freight_rate_per_kg} onChange={setT('freight_rate_per_kg')} />
          <Q label="Commission base (Rs)" value={t.commission_base_amount} onChange={setT('commission_base_amount')} />
          <Q label="Commission %" value={t.commission_pct} onChange={setT('commission_pct')} />
        </div>
        <div className="calcline">Kiraya: <b>{rs(tc.freightAmount)}</b> · Commission: <b>{rs(tc.commissionAmount)}</b> · Kul: <b>{rs(tc.total)}</b></div>
      </Panel>

      <Panel title="Tax">
        <div className="form-grid">
          <Q label="Taxable raqam (Rs)" value={x.taxable_amount} onChange={setX('taxable_amount')} />
          <Q label="Tax %" value={x.tax_pct} onChange={setX('tax_pct')} />
        </div>
        <div className="calcline">Tax: <b>{rs(xc.taxAmount)}</b> · Kul: <b>{rs(num(x.taxable_amount) + xc.taxAmount)}</b></div>
      </Panel>

      <Panel title="Zakat — jaldi andaza">
        <div className="form-grid">
          <Q label="Cash" value={z.cash_in_hand} onChange={setZ('cash_in_hand')} />
          <Q label="Bank" value={z.bank_balance} onChange={setZ('bank_balance')} />
          <Q label="Stock ki qeemat" value={z.stock_value} onChange={setZ('stock_value')} />
          <Q label="Lene wali raqam" value={z.receivables} onChange={setZ('receivables')} />
          <Q label="Dene wali raqam" value={z.payables} onChange={setZ('payables')} />
          <Q label="Nisab" value={z.nisab_threshold} onChange={setZ('nisab_threshold')} />
        </div>
        <div className="calcline">Zakatable: <b>{rs(zc.zakatable)}</b> · Zakat (2.5%): <b>{rs(zc.due)}</b></div>
      </Panel>
    </>
  );
}
