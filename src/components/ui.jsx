import { useId, useMemo, useState } from 'react';
import { PRESETS } from '../hooks/useDateRange';
import { useParties, useCatalog } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { canWrite } from '../lib/roles';
import { friendlyError } from '../lib/errors';
import { rs, balanceSide, withCurrent } from '../lib/calc';
import { fmtDateTime } from '../lib/dates';
import { T } from '../lib/i18n';

export function StatCard({ n, l, warn, good, sub }) {
  return (
    <div className={`stat-card ${warn ? 'warn' : ''} ${good ? 'good' : ''}`}>
      <div className="n">{n}</div>
      <div className="l">{l}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

export function Panel({ title, action, children, className = '', id }) {
  return (
    <section className={`panel ${className}`} id={id}>
      {(title || action) && (
        <div className="toprow">
          {title && <h2>{title}</h2>}
          {action ? <div className="panel-actions">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ kind = 'zero', children, title }) {
  return <span className={`badge ${kind}`} title={title}>{children}</span>;
}

// The <label> wraps its input, so tapping the label focuses the field and
// screen readers announce it. `plain` = no wrapping label (for checkboxes
// that bring their own label).
export function Field({ label, children, hint, wide, plain }) {
  const Tag = plain ? 'div' : 'label';
  return (
    <Tag className={`field ${wide ? 'wide' : ''}`}>
      <span className="lbl">{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </Tag>
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
  return <span className="badge zero" title={T("Offline save hui — internet aane par server par chali jayegi")}>{T("Sync baqi")}</span>;
}

export function Loading({ text = 'Loading…' }) {
  return <div className="empty loading-line">{text}</div>;
}

// Number input that accepts decimals (old forms rejected e.g. 3250.5) and
// ignores the mouse wheel (which silently changed values while scrolling).
export function NumInput({ value, onChange, min = 0, step = 'any', ...rest }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={value}
      onChange={onChange}
      onWheel={(e) => e.currentTarget.blur()}
      {...rest}
    />
  );
}

export function Select({ value, onChange, options, ...rest }) {
  return (
    <select value={value} onChange={onChange} {...rest}>
      {options.map((o) => (typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

// Text input with suggestions from the Parties list (one spelling per party)
export function PartyInput({ type, value, onChange, required, placeholder, autoFocus }) {
  const { namesOf } = useParties();
  const id = useId();
  const names = useMemo(() => namesOf(type), [namesOf, type]);
  return (
    <>
      <input
        list={id}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder || T("Naam likhein ya list se chunein")}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      <datalist id={id}>
        {names.map((n) => <option key={n} value={n} />)}
      </datalist>
    </>
  );
}

export function ListInput({ value, onChange, options, required, placeholder }) {
  const id = useId();
  return (
    <>
      <input list={id} value={value} onChange={onChange} required={required} placeholder={placeholder} autoComplete="off" />
      <datalist id={id}>
        {options.map((n) => <option key={n} value={n} />)}
      </datalist>
    </>
  );
}

// Variety dropdown from the managed list. Users allowed to manage products get
// a "+ Nayi variety" option, so a new paddy variety can be added on the spot.
export function VarietySelect({ value, onChange, required, placeholder = '— Variety chunein —' }) {
  const { varietyNames, insertVariety } = useCatalog();
  const { profile } = useAuth();
  const toast = useToast();
  const canAdd = canWrite(profile, 'products');
  const options = useMemo(() => withCurrent(varietyNames, value), [varietyNames, value]);

  async function handle(e) {
    if (e.target.value !== '__new__') return onChange(e);
    const name = (window.prompt(T("Nayi variety ka naam (e.g. Basmati 1847):")) || '').trim().replace(/\s+/g, ' ');
    if (!name) return undefined;
    const existing = varietyNames.find((n) => n.toLowerCase() === name.toLowerCase());
    if (existing) return onChange({ target: { value: existing } });
    const res = await insertVariety({ name, sort_order: 500 });
    if (res.error) {
      toast.error(friendlyError(res.error));
      return undefined;
    }
    toast.success(`${T("Variety \"")}${name}${T("\" list mein add ho gayi.")}`);
    return onChange({ target: { value: name } });
  }

  return (
    <select value={value || ''} onChange={handle} required={required}>
      <option value="">{placeholder}</option>
      {options.map((n) => <option key={n} value={n}>{n}</option>)}
      {canAdd && <option value="__new__">{T("＋ Nayi variety add karein…")}</option>}
    </select>
  );
}

// Product (maal) dropdown from the managed list, optionally limited to categories
export function ProductSelect({ value, onChange, categories, required }) {
  const { activeProducts } = useCatalog();
  const options = useMemo(
    () => withCurrent(activeProducts.filter((p) => !categories || categories.includes(p.category)).map((p) => p.name), value),
    [activeProducts, categories, value]
  );
  return (
    <select value={value || ''} onChange={onChange} required={required}>
      {!value && <option value="">{T("— Maal chunein —")}</option>}
      {options.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

// "Is party ka balance: Rs 25,000 — Mill ne dena hai"
export function BalanceHint({ type, name }) {
  const { balanceOf, findParty } = useParties();
  if (!name || !String(name).trim()) return null;
  const party = findParty(type, name);
  const bal = balanceOf(type, name);
  if (!party && !bal) return <div className="balance-hint new">{T("Nayi party — save karne par list mein shamil ho jayegi.")}</div>;
  const side = balanceSide(bal);
  return (
    <div className={`balance-hint ${side.kind}`}>{T("Pichla balance: ")}<b>{rs(Math.abs(bal))}</b> — {side.long}
      {party?.phone ? <span className="muted"> · {party.phone}</span> : null}
    </div>
  );
}

export function DateRangeBar({ range, children }) {
  return (
    <div className="filterbar">
      <label className="field">
        <span className="lbl">{T("Muddat (Period)")}</span>
        <select value={range.preset} onChange={(e) => range.setPreset(e.target.value)}>
          {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </label>
      {range.preset === 'custom' && (
        <>
          <label className="field">
            <span className="lbl">{T("Se (From)")}</span>
            <input type="date" value={range.customFrom} onChange={(e) => range.setCustom(e.target.value, range.customTo)} />
          </label>
          <label className="field">
            <span className="lbl">{T("Tak (To)")}</span>
            <input type="date" value={range.customTo} onChange={(e) => range.setCustom(range.customFrom, e.target.value)} />
          </label>
        </>
      )}
      {children}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Talash karein…' }) {
  return (
    <label className="field search">
      <span className="lbl">{T("Talash (Search)")}</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function matchesSearch(q, ...fields) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  return fields.some((f) => String(f ?? '').toLowerCase().includes(s));
}

// Renders the first N rows of a long list, with a "show more" button
export function useShowMore(rows, step = 100) {
  const [limit, setLimit] = useState(step);
  const visible = rows.length > limit ? rows.slice(0, limit) : rows;
  const more = rows.length > limit
    ? (
      <div className="showmore">
        <button type="button" className="btn small" onClick={() => setLimit((l) => l + step)}>{T("Aur dikhayein (")}{rows.length - limit}{T(" baqi)")}</button>
      </div>
    )
    : null;
  return [visible, more];
}

export function FormActions({ saving, editing, onCancel, saveLabel = 'Save Karein', extra }) {
  return (
    <div className="form-actions">
      <button type="submit" className="btn primary" disabled={saving}>
        {saving ? T("Saving…") : editing ? T("Update Karein") : saveLabel}
      </button>
      {extra}
      {editing && <button type="button" className="btn" onClick={onCancel} disabled={saving}>{T("Cancel")}</button>}
    </div>
  );
}

export function RowActions({ onEdit, onDelete, onPrint, extra, disabled }) {
  return (
    <div className="row-actions">
      {onPrint && <button type="button" className="btn small" onClick={onPrint}>{T("Print")}</button>}
      {extra}
      {onEdit && <button type="button" className="btn small" onClick={onEdit} disabled={disabled}>{T("Edit")}</button>}
      {onDelete && <button type="button" className="btn small danger" onClick={onDelete} disabled={disabled}>{T("Delete")}</button>}
    </div>
  );
}

export function SyncNote({ lastSynced, offline, error }) {
  if (offline) return <span className="sync-note warn">{T("Offline — aakhri mehfooz copy dikh rahi hai")}</span>;
  if (error) return <span className="sync-note warn">{T("Server se data nahi aa saka")}</span>;
  if (!lastSynced) return null;
  return <span className="sync-note">{T("Updated ")}{fmtDateTime(new Date(lastSynced).toISOString())}</span>;
}

export function confirmDelete(what) {
  return window.confirm(`${T("Kya aap waqai \"")}${what}${T("\" delete karna chahte hain?\n\nYeh wapas nahi hoga.")}`);
}
