import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRpc, WATCH } from '../hooks/useRpc';
import { useDateRange } from '../hooks/useDateRange';
import { useParties, useSettings } from '../context/DataContext';
import { rs, sum, balanceSide } from '../lib/calc';
import { fmtDate } from '../lib/dates';
import { PARTY_TYPES, PARTY_TYPE_LABELS, SOURCE_LABELS } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { printStatement } from '../lib/print';
import { whatsappLink, reminderText } from '../lib/whatsapp';
import { friendlyError } from '../lib/errors';
import { Panel, Field, PartyInput, DateRangeBar, Empty, Badge, StatCard, SyncNote } from '../components/ui';

export default function Statement() {
  const [params, setParams] = useSearchParams();
  const { settings } = useSettings();
  const { findParty, balanceOf } = useParties();
  const range = useDateRange('statement', 'all');
  const type = params.get('type') || 'Kisan';
  const name = params.get('name') || '';
  const [draft, setDraft] = useState({ type, name });

  const party = findParty(type, name);
  const enabled = !!name.trim();
  const { data, loading, error, offline, lastSynced } = useRpc(
    'get_party_statement',
    { p_party_type: type, p_party_name: name.trim(), p_from: range.from, p_to: range.to },
    { watch: WATCH.balances, enabled }
  );
  const rows = useMemo(() => data || [], [data]);
  const closing = rows.length ? Number(rows[rows.length - 1].balance) : 0;
  const totalDr = sum(rows, 'debit');
  const totalCr = sum(rows, 'credit');
  const side = balanceSide(closing);
  const currentBalance = balanceOf(type, name);

  function open(e) {
    e.preventDefault();
    setParams({ type: draft.type, name: draft.name.trim() });
  }

  return (
    <>
      <Panel title="Party chunein">
        <form onSubmit={open} className="filterbar">
          <Field label="Type">
            <select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}>
              {PARTY_TYPES.map((t) => <option key={t} value={t}>{PARTY_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
          <Field label="Party ka naam">
            <PartyInput type={draft.type} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} required />
          </Field>
          <button type="submit" className="btn primary">Khata Dekhein</button>
        </form>
      </Panel>

      {enabled && (
        <>
          <div className="cardgrid">
            <StatCard n={rs(Math.abs(currentBalance))} l={`Aaj tak balance — ${balanceSide(currentBalance).long}`} warn={currentBalance > 0} />
            <StatCard n={rs(totalDr)} l="Banam (Debit) — is muddat mein" />
            <StatCard n={rs(totalCr)} l="Jama (Credit) — is muddat mein" />
          </div>
          <Panel
            title={`${name} — ${type}${party?.phone ? ' · ' + party.phone : ''}`}
            action={<>
              <SyncNote lastSynced={lastSynced} offline={offline} error={error} />
              <button type="button" className="btn small" disabled={!rows.length} onClick={() => printStatement({ partyType: type, partyName: name, party, rows, from: range.from, to: range.to }, settings)}>Print</button>
              <a className="btn small" href={whatsappLink(party?.phone, reminderText(settings, name, currentBalance))} target="_blank" rel="noreferrer">WhatsApp</a>
              <button type="button" className="btn small" disabled={!rows.length} onClick={() => exportCSV(`khata_${name}.csv`, ['Date', 'Description', 'Debit', 'Credit', 'Balance', 'Side', 'Source'],
                rows.map((r) => [r.date, r.description, r.debit, r.credit, Math.abs(r.balance), balanceSide(r.balance).short, SOURCE_LABELS[r.source] || r.source]))}>CSV</button>
            </>}
          >
            <DateRangeBar range={range} />
            {error && !rows.length ? <div className="auth-error">{friendlyError(error)}</div> : null}
            <div className="tablewrap">
              <table className="data">
                <thead><tr><th>Tareekh</th><th>Tafseel</th><th>Source</th><th className="r">Banam (Debit)</th><th className="r">Jama (Credit)</th><th className="r">Balance</th></tr></thead>
                <tbody>
                  {loading && !rows.length ? <Empty colSpan={6} text="Loading…" /> : rows.length ? rows.map((r, i) => {
                    const b = Number(r.balance);
                    return (
                      <tr key={r.id || 'bf' + i} className={r.source === 'brought_forward' ? 'bf' : ''}>
                        <td>{fmtDate(r.date)}</td>
                        <td className="wrap">{r.description}</td>
                        <td><Badge kind={r.source === 'manual' ? 'zero' : 'pending'}>{SOURCE_LABELS[r.source] || r.source}</Badge></td>
                        <td className="r">{Number(r.debit) ? rs(r.debit) : ''}</td>
                        <td className="r">{Number(r.credit) ? rs(r.credit) : ''}</td>
                        <td className={`r ${b < 0 ? 'neg-text' : ''}`}><b>{rs(Math.abs(b))}</b> {b > 0 ? 'Jama' : b < 0 ? 'Banam' : ''}</td>
                      </tr>
                    );
                  }) : <Empty colSpan={6} text="Is muddat mein koi entry nahi." />}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr><td colSpan={3}>Total</td><td className="r">{rs(totalDr)}</td><td className="r">{rs(totalCr)}</td><td className="r">{rs(Math.abs(closing))}</td></tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="calcline">Closing balance: <b>{rs(Math.abs(closing))}</b> — {side.long}</div>
            <div className="note">
              <b>Jama (Credit)</b> = mill par party ka haq barha (kharid, mazdoori, udhaar saman). <b>Banam (Debit)</b> = mill ne party ko diya ya party se lena barha (adaigi, sale bill).
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
