import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getLang } from '../lib/i18n';
import { ROLE_LABELS, MODULE_LABELS, PERMISSION_MODULES, ACTIONS, ACTION_LABELS, can, canOpenRoute, isAdmin } from '../lib/roles';
import { Panel, Badge } from '../components/ui';

// Every text in both languages: [Roman Urdu, English]
const ROLE_GUIDE = {
  owner: [
    'Aap mill ke maalik (Admin) hain — har cheez dekh aur badal sakte hain. Staff ke accounts banana, har user ki ijazat (Dekhna / Naya / Badalna / Delete) set karna, Mill Settings, hisaab lock, backup/restore aur data delete/reset sirf aap ke paas hai.',
    'You are the mill owner (Admin) — you can see and change everything. Creating staff accounts, setting each user\'s permissions (View / Add / Edit / Delete), Mill Settings, the period lock, backup/restore and deleting/resetting data are yours alone.',
  ],
  manager: [
    'Aap Manager hain — mill ka rozana kaam poora chala sakte hain. Aap Munshi, Godown aur Sales staff ke accounts bana sakte hain aur un ki ijazat set kar sakte hain. Mill Settings, lock, restore aur data delete sirf Owner ke paas hain.',
    'You are the Manager — you can run all daily work of the mill. You can create Munshi, Godown and Sales staff accounts and set their permissions. Mill Settings, the lock, restore and data deletion stay with the Owner.',
  ],
  munshi: [
    'Aap Munshi / Accountant hain — kharid (kanta parchi), khata, payments aur cheques, rokar, tax/zakat aur sauda aap ka kaam hai. Production, stock aur sales bhi darj kar sakte hain.',
    'You are the Munshi / Accountant — purchases (weighbridge slips), ledgers, payments and cheques, the cash book, tax/zakat and contracts are your work. You can also record production, stock and sales.',
  ],
  godown_incharge: [
    'Aap Godown Incharge hain — kanta (gaari ka wazan), sukhai, production (milling), stock, godown lots, bardana, mazdoori, transport aur machine record aap ka kaam hai.',
    'You are the Godown Incharge — the weighbridge, drying, production (milling), stock, godown lots, bags, wages, transport and machine records are your work.',
  ],
  sales_staff: [
    'Aap Sales Staff hain — customers (parties), sale bill / invoice, gate pass aur sale ke saude aap ka kaam hai.',
    'You are Sales Staff — customers (parties), sale bills / invoices, gate passes and sale contracts are your work.',
  ],
};

const FLOW = [
  ['Fasal se pehle: Payments mein peshgi, Sauda mein booking, Bardana mein boriyan party ko dein.', 'Before harvest: advances in Payments, bookings in Contracts, bags to the party in Bags.'],
  ['Gaari aaye to Kanta par pehla wazan; khali ho to doosra wazan → slip.', 'When a truck arrives: first weight on the Weighbridge; after unloading the second weight → slip.'],
  ['"Kharid banayein" se Paddy Purchase: moisture likhein, namee rule ki katoti lagayein, rate fi maund, save + slip print.', '"Make purchase" opens Paddy Purchase: enter moisture, apply the moisture rule, rate per maund, save + print slip.'],
  ['Payments se kisan/arhti ko paise (cash, bank ya cheque) — khata khud barabar hota hai.', 'Pay the farmer/arhti in Payments (cash, bank or cheque) — the ledger updates itself.'],
  ['Geeli paddy ki Sukhai darj karein; godown lot aur fumigation Stock mein.', 'Record drying of wet paddy; godown lots and fumigation in Stock.'],
  ['Production mein milling: paddy input aur har product ka output → recovery %.', 'Milling in Production: paddy input and each product\'s output → recovery %.'],
  ['Sales mein bill / export invoice, gate pass; wasooli Payments mein.', 'Bills / export invoices and gate passes in Sales; collections in Payments.'],
  ['Rozana Rokar, Reports (laagat, munafa) aur Stats dekhein; mahina band ho to Owner hisaab lock kare.', 'Check the Cash Book, Reports (costing, profit) and Stats daily; when a month closes the Owner locks the books.'],
];

const MODULES = [
  { path: '/weighbridge', t: ['Kanta (Weighbridge)', 'Weighbridge'], s: [
    ['Gaari andar aaye: Qisam, gaari #, party aur pehla wazan likh kar "Pehla Wazan Save".', 'Truck in: enter type, vehicle #, party and first weight, then "Save First Weight".'],
    ['Gaari khali ho: "Andar wali gaariyan" mein doosra wazan likhein → "Save + Slip" (slip print hoti hai).', 'After unloading: enter the second weight under "Vehicles inside" → "Save + Slip" (prints the slip).'],
    ['Paddy ki gaari ho to register mein "Kharid banayein" dabayein — wazan khud bhar jata hai.', 'For a paddy truck press "Make purchase" in the register — the weights fill in automatically.'],
    ['Bahar walon ka wazan (Public) ho to fee likhein — Rokar mein aamad ban jati hai.', 'For public weighing enter the fee — it becomes cash income in the Cash Book.'],
  ] },
  { path: '/purchase', t: ['Paddy Purchase (Kharid)', 'Paddy Purchase'], s: [
    ['Direct kisan ya Arhti ke zariye chunein; Arhti ho to khata kis ke naam jaye, woh bhi chunein.', 'Choose direct farmer or through an Arhti; for an Arhti choose whose ledger it goes to.'],
    ['Gross, tare, bags aur bardana/namee katoti likhein — net wazan aur maund khud nikalte hain.', 'Enter gross, tare, bags and bag/moisture deductions — net weight and maunds are calculated.'],
    ['Moisture % likhein to mill ke rule se katoti ka mashwara aata hai — "Rule lagayein".', 'Enter moisture % and the mill rule suggests a deduction — "Apply rule".'],
    ['Rate fi maund, commission, mazdoori aur mauqa par adaigi → "Save + Slip Print". Khata khud banta hai.', 'Rate per maund, commission, labour and on-the-spot payment → "Save + Slip Print". The ledger is made automatically.'],
  ] },
  { path: '/contracts', t: ['Sauda / Contracts', 'Contracts'], s: [
    ['Sale ya kharid ka sauda: party, maal, miqdar, rate (kg/maund/MT), currency aur delivery ki muddat.', 'Sale or purchase contract: party, goods, quantity, rate (kg/maund/MT), currency and delivery period.'],
    ['Bill ya kharid banate waqt sauda chunein — rawana/baqi progress khud chalti hai.', 'Choose the contract when billing or purchasing — delivered/pending progress updates itself.'],
    ['Overdue saude laal dikhte hain; Proforma / sauda print kar sakte hain.', 'Overdue contracts show in red; you can print a proforma / contract.'],
  ] },
  { path: '/parties', t: ['Parties', 'Parties'], s: [
    ['Kisan, Arhti, Customer, Supplier waghaira ka naam, phone aur opening balance.', 'Name, phone and opening balance of farmers, arhtis, customers, suppliers etc.'],
    ['Har party ka baqaya list mein; WhatsApp yaad-dehani bhej sakte hain.', 'Each party\'s balance is in the list; you can send a WhatsApp reminder.'],
    ['Ghalat spelling wali duplicate party ko "Merge" karein — saari entries asal party par.', '"Merge" a misspelt duplicate party — all entries move to the correct one.'],
  ] },
  { path: '/statement', t: ['Khata Statement', 'Party Statement'], s: [
    ['Party chunein — har entry, running balance aur muddat ka khulasa.', 'Choose a party — every entry, running balance and period summary.'],
    ['Print ya WhatsApp par party ko bhejein.', 'Print it or send it to the party on WhatsApp.'],
  ] },
  { path: '/ledger', t: ['Khata / Ledger', 'Ledger'], s: [
    ['Kharid, sale, payment, mazdoori ki entries khud banti hain (inhein asal record se badlein).', 'Purchase, sale, payment and wage entries are automatic (change them from the source record).'],
    ['Qarz, adjustment jaise kaam ke liye "Manual Khata Entry" (Jama / Banam).', 'Use "Manual Ledger Entry" (Credit / Debit) for loans, adjustments etc.'],
  ] },
  { path: '/payments', t: ['Payments & Cheques', 'Payments & Cheques'], s: [
    ['Mill ne diya (adaigi) ya mill ne liya (wasooli): cash, bank, online ya cheque.', 'Mill paid or mill received: cash, bank, online or cheque.'],
    ['Post-dated cheque ki due date likhein — dashboard yaad dilata hai; clear/bounce yahan se.', 'Enter the due date of post-dated cheques — the dashboard reminds you; clear/bounce them here.'],
    ['"Save + Raseed Print" se raseed party ko dein.', 'Give the party a receipt with "Save + Print Receipt".'],
  ] },
  { path: '/cashbook', t: ['Cash Book / Rokar', 'Cash Book'], s: [
    ['Cash aur bank ki rozana aamad/kharch khud banti hai (payments, kharche, sale wasooli…).', 'Daily cash and bank in/out is built automatically (payments, expenses, sale receipts…).'],
    ['Capital, nikasi, bank transfer, qarz jaisi baqi entries "Doosri Cash Entry" se.', 'Record capital, drawings, bank transfers, loans etc. as "Other Cash Entry".'],
  ] },
  { path: '/drying', t: ['Sukhai (Drying)', 'Drying'], s: [
    ['Variety, dher/lot, sukhai se pehle aur baad ka wazan, moisture.', 'Variety, heap/lot, weight before and after drying, moisture.'],
    ['Kami paddy stock se khud kam hoti hai aur Laagat report mein shamil hoti hai.', 'The loss leaves the paddy stock automatically and is included in the costing report.'],
  ] },
  { path: '/production', t: ['Production (Milling)', 'Production (Milling)'], s: [
    ['Lot #, process (Raw/Sella/Steam), paddy variety aur paddy input (kg).', 'Lot #, process (Raw/Sella/Steam), paddy variety and paddy input (kg).'],
    ['Har product (full grain, toota, phak, toori…) ka output aur wastage likhein.', 'Enter the output of each product (full grain, broken, bran, husk…) and wastage.'],
    ['Recovery % aur head rice % khud nikalte hain; stock khud update hota hai.', 'Recovery % and head rice % are calculated; stock updates itself.'],
  ] },
  { path: '/stock', t: ['Stock / Godown', 'Stock / Godown'], s: [
    ['Stock summary khud banta hai (kharid, production, sale se).', 'The stock summary builds itself (from purchases, production, sales).'],
    ['Pehli dafa "Opening Stock" adjustment; kami/izafa ya apna istemal bhi adjustment se.', 'First time: an "Opening Stock" adjustment; shortages/excess or own use are adjustments too.'],
    ['Godown lots mein kahan kya rakha hai aur fumigation ki tareekh.', 'Godown lots record where goods are and the fumigation date.'],
  ] },
  { path: '/bags', t: ['Bardana (Boriyan)', 'Bags'], s: [
    ['Party ko boriyan di / wapas aayin / mill ne khareedin / istemal huin.', 'Bags given to a party / returned / bought by the mill / used.'],
    ['"Paise lagenge" chunein to boriyon ki raqam party ke khata mein jati hai.', 'Choose "charge" and the bag value goes to the party\'s ledger.'],
  ] },
  { path: '/products', t: ['Products & Varieties', 'Products & Varieties'], s: [
    ['Naya maal (jaise Sella, B1 Tota) aur nayi variety (jaise Basmati 1847) yahan add karein.', 'Add new products (e.g. Sella, B1 broken) and varieties (e.g. Basmati 1847) here.'],
    ['Product ki qisam (chawal / toota / by-product) se recovery sahi nikalti hai.', 'A product\'s category (rice / broken / by-product) keeps recovery correct.'],
  ] },
  { path: '/sales', t: ['Sales & Billing', 'Sales & Billing'], s: [
    ['Customer, maal, variety, wazan, rate (kg/maund/MT) aur tax — invoice number khud.', 'Customer, goods, variety, weight, rate (kg/maund/MT) and tax — invoice number is automatic.'],
    ['Export: currency + exchange rate, LC/B-L/vessel — Commercial Invoice aur Packing List.', 'Export: currency + exchange rate, LC/B-L/vessel — Commercial Invoice and Packing List.'],
    ['"Gate Pass" se bina rate ki parchi driver/gate ke liye.', '"Gate Pass" prints a slip without prices for the driver/gate.'],
  ] },
  { path: '/labor', t: ['Labor & Wages', 'Labor & Wages'], s: [
    ['Dihari, piece rate ya mahana mazdoori; advance katoti.', 'Daily, piece-rate or monthly wages; advance deductions.'],
    ['"Ada karein" se adaigi — Rokar mein khud darj.', '"Mark paid" records the payment — it goes to the Cash Book.'],
  ] },
  { path: '/transport', t: ['Transport', 'Transport'], s: [
    ['Kiraya (wazan × rate) ya commission; cash, bank ya udhaar.', 'Freight (weight × rate) or commission; cash, bank or credit.'],
  ] },
  { path: '/expenses', t: ['Machinery & Kharche', 'Machinery & Expenses'], s: [
    ['Rozana kharche (bijli, diesel, packing…) category ke saath; udhaar ho to supplier ka naam.', 'Daily expenses (electricity, diesel, packing…) by category; for credit, the supplier name.'],
    ['Machine ki repair/service aur agli service ki tareekh.', 'Machine repairs/service and the next service date.'],
  ] },
  { path: '/tax', t: ['Tax & Zakat', 'Tax & Zakat'], s: [
    ['GST, withholding, market fee ke records aur un ki adaigi.', 'GST, withholding and market fee records and their payment.'],
    ['Zakat ka aasaan hisaab — "System se bharein" se cash, stock aur udhaar khud.', 'A simple zakat calculation — "Fill from system" brings cash, stock and receivables.'],
  ] },
  { path: '/reports', t: ['Reports', 'Reports'], s: [
    ['Munafa/nuqsan, laagat (fi maund chawal kitne ka para), party-wise balance, variety-wise kharid.', 'Profit/loss, costing (what a maund of rice cost), party balances, purchases by variety.'],
  ] },
  { path: '/analytics', t: ['Stats / Analytics', 'Stats / Analytics'], s: [
    ['Graphs: kharid vs sale, recovery trend, variety ka rate, top parties, kharche; udhaar ki umar.', 'Charts: purchases vs sales, recovery trend, variety rates, top parties, expenses; credit ageing.'],
  ] },
];

const ADMIN_TIPS = [
  ['Users & Roles: naya account banayein, role dein, Suspend ya Delete karein.', 'Users & Roles: create accounts, give a role, suspend or delete.'],
  ['"Permissions" se har module ke liye Dekhna / Naya / Badalna / Delete alag on/off karein — jaise Munshi kharid daal sake magar delete na kar sake.', 'Use "Permissions" to switch View / Add / Edit / Delete per module — e.g. the Munshi may add purchases but not delete them.'],
  ['Activity Log mein har tabdeeli ki purani aur nayi value — kis ne, kab.', 'The Activity Log shows each change with old and new values — who and when.'],
  ['Backup / Import se hafte mein ek Full Backup download karein.', 'Download a Full Backup weekly from Backup / Import.'],
];

const OWNER_TIPS = [
  ['Mill Settings: naam, NTN, numbering, namee rule aur hisaab lock (band mahine ko koi na badal sake).', 'Mill Settings: name, NTN, numbering, moisture rule and period lock (nobody can change a closed month).'],
  ['Reset / Delete Data: muddat aur register chun kar purana/ghalat data mitayein, ya naya season (balances aage).', 'Reset / Delete Data: delete old/wrong data by period and register, or start a new season (balances carried forward).'],
];

const COMMON_TIPS = [
  ['Upar EN / UR se zaban aur ☾ / ☀ se dark/light mode badlein.', 'Switch language with EN / UR and dark/light mode with ☾ / ☀ at the top.'],
  ['Internet na ho tab bhi entry karein — internet aate hi khud sync hoti hai.', 'Keep entering even without internet — entries sync automatically when it is back.'],
  ['Apna password "Mera Account" se badlein.', 'Change your password from "My Account".'],
];

export default function Guide() {
  const { profile } = useAuth();
  const L = getLang() === 'en' ? 1 : 0;
  const role = profile?.role || 'pending';
  const roleText = ROLE_GUIDE[role];
  const visible = MODULES.filter((m) => canOpenRoute(profile, m.path));

  return (
    <>
      <Panel title={L ? 'Guide — your work in this app' : 'Guide — app mein aap ka kaam'}>
        <div className="guide-role">
          <b>{L ? 'Your role' : 'Aap ka role'}: {ROLE_LABELS[role] || role}</b>
          {roleText && <div style={{ marginTop: 4 }}>{roleText[L]}</div>}
        </div>
        <div className="tablewrap">
          <table className="data compact perm-grid">
            <thead><tr><th>{L ? 'Module' : 'Module'}</th>{ACTIONS.map((a) => <th key={a}>{ACTION_LABELS[a]}</th>)}</tr></thead>
            <tbody>
              {PERMISSION_MODULES.map((m) => (
                <tr key={m}>
                  <td>{MODULE_LABELS[m]}</td>
                  {ACTIONS.map((a) => <td key={a}>{can(profile, m, a) ? '✓' : '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="note">{L ? 'Need more access? Ask the Owner or Manager (Users & Roles → Permissions).' : 'Zyada ijazat chahiye? Owner ya Manager se kahein (Users & Roles → Permissions).'}</div>
      </Panel>

      <Panel title={L ? 'From harvest to market — the mill\'s process' : 'Fasal se bazaar tak — mill ka process'}>
        <ol className="guide-flow">{FLOW.map((f) => <li key={f[0]}>{f[L]}</li>)}</ol>
      </Panel>

      <Panel title={L ? 'Step by step — the sections you can open' : 'Step by step — jo hisse aap khol sakte hain'}>
        {visible.map((m) => {
          const mod = Object.entries({ '/weighbridge': 'weighbridge', '/purchase': 'purchase', '/contracts': 'sales', '/parties': 'parties', '/statement': 'ledger',
            '/ledger': 'ledger', '/payments': 'payments', '/cashbook': 'cashbook', '/drying': 'production', '/production': 'production', '/stock': 'stock',
            '/bags': 'stock', '/products': 'products', '/sales': 'sales', '/labor': 'labor', '/transport': 'transport', '/expenses': 'expenses', '/tax': 'tax',
            '/reports': 'reports', '/analytics': 'reports' }).find(([p]) => p === m.path)?.[1];
          const rights = mod ? ACTIONS.filter((a) => can(profile, mod, a)) : ['view'];
          return (
            <details key={m.path} className="guide-item">
              <summary>{m.t[L]}</summary>
              <div className="guide-tags">
                {rights.map((a) => <Badge key={a} kind={a === 'view' ? 'zero' : 'neg'}>{ACTION_LABELS[a]}</Badge>)}
                {rights.length === 1 && rights[0] === 'view' && <span className="muted">{L ? 'You can only view this section.' : 'Aap yeh hissa sirf dekh sakte hain.'}</span>}
              </div>
              <ol>{m.s.map((st) => <li key={st[0]}>{st[L]}</li>)}</ol>
              <Link className="btn small" to={m.path}>{L ? 'Open' : 'Kholein'} →</Link>
            </details>
          );
        })}
      </Panel>

      {isAdmin(profile) && (
        <Panel title={L ? 'Owner / Manager' : 'Owner / Manager ke kaam'}>
          <ul>{ADMIN_TIPS.map((t) => <li key={t[0]}>{t[L]}</li>)}</ul>
          {role === 'owner' && <ul>{OWNER_TIPS.map((t) => <li key={t[0]}>{t[L]}</li>)}</ul>}
        </Panel>
      )}

      <Panel title={L ? 'Good to know' : 'Kaam ki baatein'}>
        <ul>{COMMON_TIPS.map((t) => <li key={t[0]}>{t[L]}</li>)}</ul>
      </Panel>
    </>
  );
}
