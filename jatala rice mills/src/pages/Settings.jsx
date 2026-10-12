import { useEffect, useState } from 'react';
import { useSettings } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { friendlyError } from '../lib/errors';
import { num } from '../lib/calc';
import { Panel, Field, NumInput } from '../components/ui';

const FIELDS = ['mill_name', 'address', 'phone', 'ntn', 'strn', 'season_start', 'fumigation_days', 'ageing_days', 'invoice_prefix', 'slip_prefix', 'invoice_footer', 'lock_date', 'moisture_base_pct', 'moisture_kg_per_point'];

export default function Settings() {
  const { settings, save, loading } = useSettings();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && form === null) {
      setForm(Object.fromEntries(FIELDS.map((k) => [k, settings[k] == null ? '' : String(settings[k])])));
    }
  }, [loading, settings, form]);

  if (!form) return <div className="empty">Loading…</div>;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const res = await save({
      mill_name: form.mill_name.trim() || 'Rice Mill', address: form.address.trim(), phone: form.phone.trim(), ntn: form.ntn.trim(),
      strn: form.strn.trim(), season_start: form.season_start || null, fumigation_days: Math.max(1, Math.round(num(form.fumigation_days)) || 30),
      ageing_days: Math.max(1, Math.round(num(form.ageing_days)) || 60), invoice_prefix: form.invoice_prefix, slip_prefix: form.slip_prefix,
      invoice_footer: form.invoice_footer.trim(), lock_date: form.lock_date || null,
      moisture_base_pct: num(form.moisture_base_pct), moisture_kg_per_point: num(form.moisture_kg_per_point),
    });
    setSaving(false);
    if (res.error) return toast.error(friendlyError(res.error));
    toast.success('Settings save ho gayin.');
  }

  return (
    <form onSubmit={submit}>
      <Panel title="Mill ki maloomat (slip, invoice aur statement par chhapti hai)">
        <div className="form-grid">
          <Field label="Mill ka naam" wide><input value={form.mill_name} onChange={set('mill_name')} required /></Field>
          <Field label="Pata (Address)" wide><input value={form.address} onChange={set('address')} /></Field>
          <Field label="Phone"><input value={form.phone} onChange={set('phone')} /></Field>
          <Field label="NTN"><input value={form.ntn} onChange={set('ntn')} /></Field>
          <Field label="STRN (sales tax)"><input value={form.strn} onChange={set('strn')} /></Field>
          <Field label="Invoice ke neeche note" wide><input value={form.invoice_footer} onChange={set('invoice_footer')} placeholder="e.g. Maal check kar ke wasool karein. Shukriya!" /></Field>
        </div>
      </Panel>
      <Panel title="Season, alerts aur numbering">
        <div className="form-grid">
          <Field label="Season shuru (dashboard ka hisaab)" hint="Khali = shuru se"><input type="date" value={form.season_start} onChange={set('season_start')} /></Field>
          <Field label="Fumigation har kitne din?"><NumInput step="1" min="1" value={form.fumigation_days} onChange={set('fumigation_days')} /></Field>
          <Field label="Purana stock warning (din)"><NumInput step="1" min="1" value={form.ageing_days} onChange={set('ageing_days')} /></Field>
          <Field label="Invoice # prefix"><input value={form.invoice_prefix} onChange={set('invoice_prefix')} /></Field>
          <Field label="Kharid slip # prefix"><input value={form.slip_prefix} onChange={set('slip_prefix')} /></Field>
        </div>
        <div className="note">Prefix badalne se sirf naye number badalte hain (e.g. INV-2026-00001). Purane number wese hi rehte hain.</div>
      </Panel>
      <Panel title="Namee (moisture) katoti ka rule">
        <div className="form-grid">
          <Field label="Is moisture % tak koi katoti nahi" hint="e.g. 14 · 0 = rule band"><NumInput value={form.moisture_base_pct} onChange={set('moisture_base_pct')} /></Field>
          <Field label="Har 1% zyada par katoti (kg fi maund)" hint="e.g. 1"><NumInput value={form.moisture_kg_per_point} onChange={set('moisture_kg_per_point')} /></Field>
        </div>
        <div className="note">Kharid form mein moisture % likhte hi is rule se katoti ka mashwara aata hai — munshi ek click se laga sakta hai (ya badal sakta hai).</div>
      </Panel>
      <Panel title="Hisaab band karna (Period lock)">
        <div className="form-grid">
          <Field label="Is tareekh tak hisaab band (lock)" hint="Khali = koi lock nahi"><input type="date" value={form.lock_date} onChange={set('lock_date')} /></Field>
        </div>
        <div className="note">
          Mahina/saal band karne ke baad yahan us ki aakhri tareekh daal dein — us tareekh tak ki kharid, sale, payment, khata, kharche,
          production, mazdoori wagaira <b>koi bhi</b> (Owner samet) na nayi daal sakega, na badal ya mita sakega. Purane cheque ka clear/bounce
          aur purani mazdoori ki adaigi phir bhi ho sakti hai. Ghalti theek karni ho to Owner lock ki tareekh peeche kar de.
        </div>
      </Panel>
      <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Settings Save Karein'}</button>
    </form>
  );
}
