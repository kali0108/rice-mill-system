import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { emitLocalChange } from '../lib/realtime';
import { can } from '../lib/roles';
import { num } from '../lib/calc';
import { PRODUCT_CATEGORIES, CATEGORY_LABELS } from '../lib/constants';
import { friendlyError } from '../lib/errors';
import { Panel, Field, NumInput, Badge, Empty, FormActions, confirmDelete } from '../components/ui';
import { T } from '../lib/i18n';

const blankProduct = () => ({ name: '', category: 'rice', has_variety: true, sale_unit: 'maund', sort_order: '', active: true, notes: '' });
const blankVariety = () => ({ name: '', sort_order: '', active: true, notes: '' });

// Tables whose data changes when a name is renamed / merged
const AFFECTED = ['products', 'varieties', 'purchases', 'production_batches', 'sales', 'stock_adjustments', 'stock_lots', 'ledger_entries'];

function MergeBox({ kind, from, options, onDone, onCancel }) {
  const toast = useToast();
  const [into, setInto] = useState('');
  async function go() {
    const target = options.find((o) => o.id === into);
    if (!target) return toast.error(T("Kis mein merge karna hai, chunein."));
    if (!window.confirm(`"${from.name}${T("\" ki saari entries \"")}${target.name}${T("\" mein chali jayengi aur \"")}${from.name}${T("\" list se hat jayega. Theek hai?")}`)) return;
    const fn = kind === 'product' ? 'merge_product' : 'merge_variety';
    const { error } = await supabase.rpc(fn, { p_from: from.id, p_into: target.id });
    if (error) return toast.error(friendlyError(error));
    toast.success(T("Merge ho gaya."));
    AFFECTED.forEach(emitLocalChange);
    onDone();
  }
  return (
    <div className="subpanel" style={{ marginBottom: 12 }}>
      <div className="note">{T("Ghalat spelling ya duplicate \"")}{from.name}{T("\" ko asal naam mein mila dein — har kharid, production, sale aur stock entry badal jayegi.")}</div>
      <div className="filterbar">
        <Field label={T("Asal naam chunein")}>
          <select value={into} onChange={(e) => setInto(e.target.value)}>
            <option value="">{T("— chunein —")}</option>
            {options.filter((o) => o.id !== from.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <button type="button" className="btn primary" onClick={go}>{T("Merge Karein")}</button>
        <button type="button" className="btn" onClick={onCancel}>{T("Cancel")}</button>
      </div>
    </div>
  );
}

export default function Products() {
  const { profile } = useAuth();
  const toast = useToast();
  const { products, varieties, insertProduct, updateProduct, removeProduct, insertVariety, updateVariety, removeVariety, loading } = useCatalog();
  const writable = can(profile, 'products', 'add');
  const canEdit = can(profile, 'products', 'edit');
  const canDel = can(profile, 'products', 'delete');

  const [pForm, setPForm] = useState(blankProduct);
  const [pEditing, setPEditing] = useState(null);
  const [vForm, setVForm] = useState(blankVariety);
  const [vEditing, setVEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [mergeP, setMergeP] = useState(null);
  const [mergeV, setMergeV] = useState(null);
  const setP = (k) => (e) => setPForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setV = (k) => (e) => setVForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const editingPaddy = pEditing && products.find((p) => p.id === pEditing)?.category === 'paddy';
  const grouped = useMemo(() => PRODUCT_CATEGORIES.map((c) => ({ ...c, items: products.filter((p) => p.category === c.value) })).filter((g) => g.items.length), [products]);

  async function saveProduct(e) {
    e.preventDefault();
    if (saving) return;
    const name = pForm.name.trim().replace(/\s+/g, ' ');
    if (!name) return toast.error(T("Product ka naam likhein."));
    if (products.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== pEditing)) return toast.error(T("Is naam ka product pehle se maujood hai."));
    const old = products.find((p) => p.id === pEditing);
    if (old && old.name !== name && !window.confirm(`${T("Naam \"")}${old.name}${T("\" se \"")}${name}${T("\" ho jayega — har production, sale aur stock entry mein bhi. Theek hai?")}`)) return;
    const payload = {
      name, category: pForm.category, has_variety: !!pForm.has_variety, sale_unit: pForm.sale_unit,
      sort_order: pForm.sort_order === '' ? 100 : Math.round(num(pForm.sort_order)), active: !!pForm.active, notes: pForm.notes.trim(),
    };
    setSaving(true);
    const res = pEditing ? await updateProduct(pEditing, payload) : await insertProduct(payload);
    setSaving(false);
    if (res.error) return toast.error(friendlyError(res.error));
    toast.success(pEditing ? T("Product update ho gaya.") : `${T("Product \"")}${name}${T("\" add ho gaya — ab Production, Sale aur Stock mein milega.")}`);
    if (old && old.name !== name) AFFECTED.forEach(emitLocalChange);
    setPEditing(null);
    setPForm(blankProduct());
  }

  async function saveVariety(e) {
    e.preventDefault();
    if (saving) return;
    const name = vForm.name.trim().replace(/\s+/g, ' ');
    if (!name) return toast.error(T("Variety ka naam likhein."));
    if (varieties.some((v) => v.name.toLowerCase() === name.toLowerCase() && v.id !== vEditing)) return toast.error(T("Is naam ki variety pehle se maujood hai."));
    const old = varieties.find((v) => v.id === vEditing);
    if (old && old.name !== name && !window.confirm(`${T("Naam \"")}${old.name}${T("\" se \"")}${name}${T("\" ho jayega — har kharid, production, sale aur stock mein bhi. Theek hai?")}`)) return;
    const payload = { name, sort_order: vForm.sort_order === '' ? 100 : Math.round(num(vForm.sort_order)), active: !!vForm.active, notes: vForm.notes.trim() };
    setSaving(true);
    const res = vEditing ? await updateVariety(vEditing, payload) : await insertVariety(payload);
    setSaving(false);
    if (res.error) return toast.error(friendlyError(res.error));
    toast.success(vEditing ? T("Variety update ho gayi.") : `${T("Variety \"")}${name}${T("\" add ho gayi.")}`);
    if (old && old.name !== name) AFFECTED.forEach(emitLocalChange);
    setVEditing(null);
    setVForm(blankVariety());
  }

  async function toggleActive(kind, row) {
    const res = kind === 'product' ? await updateProduct(row.id, { active: !row.active }) : await updateVariety(row.id, { active: !row.active });
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success(row.active ? `"${row.name}${T("\" ab dropdowns mein nahi dikhega (purani entries wesi hi).")}` : `"${row.name}${T("\" phir se active.")}`);
  }

  async function del(kind, row) {
    if (!confirmDelete(row.name)) return;
    const res = kind === 'product' ? await removeProduct(row.id) : await removeVariety(row.id);
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success(T("Delete ho gaya."));
  }

  return (
    <>
      <div className="calcline">{T("Yahan mill ka ")}<b>{T("maal (products)")}</b>{T(" aur paddy/chawal ki ")}<b>{T("varieties")}</b>{T(" sambhalein. Naya product (jaise Sella, Steam, B1 Tota, Rice Polish) ya nayi variety (jaise Basmati 1847) add karte hi woh Kharid, Production, Sale aur Stock ke dropdowns mein aa jati hai. Naam badlne par purani entries mein bhi badal jata hai. Jo cheez istemal ho chuki ho woh delete nahi hoti — usay ")}<b>{T("Inactive")}</b>{T(" ya ")}<b>{T("Merge")}</b>{T(" karein.")}</div>

      {(writable || (pEditing && canEdit)) && (
        <Panel title={pEditing ? T("Product Edit Karein") : T("Naya Product (maal)")}>
          <form onSubmit={saveProduct}>
            <div className="form-grid">
              <Field label={T("Product ka naam")}><input value={pForm.name} onChange={setP('name')} required disabled={editingPaddy} placeholder={T("e.g. Sella Rice, B1 Tota")} /></Field>
              <Field label={T("Qisam (category)")} hint={T("Recovery % mein Chawal + Toota gine jaate hain")}>
                <select value={pForm.category} onChange={setP('category')} disabled={editingPaddy}>
                  {PRODUCT_CATEGORIES.filter((c) => c.value !== 'paddy' || editingPaddy).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              <Field label={T("Sale rate aam tor par")}>
                <select value={pForm.sale_unit} onChange={setP('sale_unit')}>
                  <option value="maund">{T("Fi maund (40 kg)")}</option><option value="kg">{T("Fi kg")}</option>
                </select>
              </Field>
              <Field label={T("Tarteeb (chhota number pehle)")}><NumInput step="1" value={pForm.sort_order} onChange={setP('sort_order')} placeholder="100" /></Field>
              <Field label={T("Variety-wise stock?")} plain>
                <label className="check"><input type="checkbox" checked={pForm.has_variety} onChange={setP('has_variety')} />{T(" Haan (jaise chawal). Phak/toori ke liye Nahi.")}</label>
              </Field>
              <Field label={T("Status")} plain>
                <label className="check"><input type="checkbox" checked={pForm.active} onChange={setP('active')} disabled={editingPaddy} />{T(" Active")}</label>
              </Field>
              <Field label={T("Note")} wide><input value={pForm.notes} onChange={setP('notes')} /></Field>
            </div>
            <FormActions saving={saving} editing={!!pEditing} onCancel={() => { setPEditing(null); setPForm(blankProduct()); }} saveLabel={T("Product Save Karein")} />
          </form>
        </Panel>
      )}

      <Panel title={T("Products (maal)")}>
        {mergeP && <MergeBox kind="product" from={mergeP} options={products.filter((p) => p.category !== 'paddy')} onDone={() => setMergeP(null)} onCancel={() => setMergeP(null)} />}
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Naam")}</th><th>{T("Qisam")}</th><th>{T("Variety-wise")}</th><th>{T("Sale rate")}</th><th>{T("Status")}</th><th></th></tr></thead>
            <tbody>
              {loading && !products.length ? <Empty colSpan={6} text={T("Loading…")} /> : grouped.length ? grouped.flatMap((g) => g.items.map((p) => (
                <tr key={p.id || p.name} className={p.active === false ? 'dim' : ''}>
                  <td><b>{p.name}</b>{p.notes ? <div className="muted">{p.notes}</div> : null}</td>
                  <td>{CATEGORY_LABELS[p.category] || p.category}</td>
                  <td>{p.has_variety === false ? T("Nahi") : T("Haan")}</td>
                  <td>{p.sale_unit === 'kg' ? T("Fi kg") : T("Fi maund")}</td>
                  <td>{p.active === false ? <Badge>{T("Inactive")}</Badge> : <Badge kind="neg">{T("Active")}</Badge>}</td>
                  <td>
                    {(canEdit || canDel) && p.id && (
                      <div className="row-actions">
                        <button type="button" className="btn small" onClick={() => { setPEditing(p.id); setPForm({ name: p.name, category: p.category, has_variety: p.has_variety !== false, sale_unit: p.sale_unit || 'maund', sort_order: String(p.sort_order ?? ''), active: p.active !== false, notes: p.notes || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{T("Edit")}</button>
                        {p.category !== 'paddy' && (
                          <>
                            <button type="button" className="btn small" onClick={() => toggleActive('product', p)}>{p.active === false ? T("Active karein") : T("Inactive")}</button>
                            <button type="button" className="btn small" onClick={() => { setMergeP(p); setMergeV(null); }}>{T("Merge")}</button>
                            {canDel && <button type="button" className="btn small danger" onClick={() => del('product', p)}>{T("Delete")}</button>}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))) : <Empty colSpan={6} text={T("Koi product nahi.")} />}
            </tbody>
          </table>
        </div>
      </Panel>

      {(writable || (vEditing && canEdit)) && (
        <Panel title={vEditing ? T("Variety Edit Karein") : T("Nayi Variety (paddy / chawal ki qisam)")}>
          <form onSubmit={saveVariety}>
            <div className="form-grid">
              <Field label={T("Variety ka naam")}><input value={vForm.name} onChange={setV('name')} required placeholder={T("e.g. Basmati 1847")} /></Field>
              <Field label={T("Tarteeb (chhota number pehle)")}><NumInput step="1" value={vForm.sort_order} onChange={setV('sort_order')} placeholder="100" /></Field>
              <Field label={T("Status")} plain>
                <label className="check"><input type="checkbox" checked={vForm.active} onChange={setV('active')} />{T(" Active")}</label>
              </Field>
              <Field label={T("Note")}><input value={vForm.notes} onChange={setV('notes')} /></Field>
            </div>
            <FormActions saving={saving} editing={!!vEditing} onCancel={() => { setVEditing(null); setVForm(blankVariety()); }} saveLabel={T("Variety Save Karein")} />
          </form>
        </Panel>
      )}

      <Panel title={T("Varieties")}>
        {mergeV && <MergeBox kind="variety" from={mergeV} options={varieties} onDone={() => setMergeV(null)} onCancel={() => setMergeV(null)} />}
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Naam")}</th><th>{T("Status")}</th><th></th></tr></thead>
            <tbody>
              {varieties.length ? varieties.map((v) => (
                <tr key={v.id || v.name} className={v.active === false ? 'dim' : ''}>
                  <td><b>{v.name}</b>{v.notes ? <div className="muted">{v.notes}</div> : null}</td>
                  <td>{v.active === false ? <Badge>{T("Inactive")}</Badge> : <Badge kind="neg">{T("Active")}</Badge>}</td>
                  <td>
                    {(canEdit || canDel) && v.id && (
                      <div className="row-actions">
                        <button type="button" className="btn small" onClick={() => { setVEditing(v.id); setVForm({ name: v.name, sort_order: String(v.sort_order ?? ''), active: v.active !== false, notes: v.notes || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{T("Edit")}</button>
                        <button type="button" className="btn small" onClick={() => toggleActive('variety', v)}>{v.active === false ? T("Active karein") : T("Inactive")}</button>
                        <button type="button" className="btn small" onClick={() => { setMergeV(v); setMergeP(null); }}>{T("Merge")}</button>
                        {canDel && <button type="button" className="btn small danger" onClick={() => del('variety', v)}>{T("Delete")}</button>}
                      </div>
                    )}
                  </td>
                </tr>
              )) : <Empty colSpan={3} text={T("Koi variety nahi.")} />}
            </tbody>
          </table>
        </div>
        {!writable && <div className="note">{T("Products/varieties badalne ki ijazat Owner aur Munshi ke paas hai.")}</div>}
      </Panel>
    </>
  );
}
