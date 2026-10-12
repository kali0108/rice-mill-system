# Kanta Khata v5 — Rice Mill Manager

Pakistani rice mill ka mukammal hisaab-kitaab: **paddy kharid (kanta parchi) → khata → milling → stock → sale (bill) → rokar → reports**.
Mobile aur computer dono par chalta hai, bina internet ke bhi entries leta hai, aur kai staff members ek waqt mein apne apne role ke mutabiq kaam karte hain.

Setup ke liye: **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** · Kya badla: **[CHANGELOG.md](CHANGELOG.md)**

---

## Fasal se bazaar tak — mill ka poora hisaab (step by step)

| # | Asal kaam | App mein kahan | Khud kya hota hai |
|---|---|---|---|
| 1 | Fasal se pehle peshgi (advance) aur sauda | **Payments** (Party ko diya) · **Sauda / Contracts** | Peshgi party ke khata mein Banam; sauda ki miqdar/rate mehfooz |
| 2 | Arhti/Kisan ko boriyan (bardana) dena | **Bardana (Boriyan)** → "Party ko di" | Kis ke paas kitni boriyan; charge karein to khata mein |
| 3 | Gaari mill ke gate par — bhari gaari ka wazan | **Kanta (Weighbridge)** → pehla wazan | Gaari "andar" list mein |
| 4 | Sample: moisture, toota, mitti | **Paddy Purchase** form | Mill ke **namee rule** se katoti ka mashwara (ek click) |
| 5 | Khali gaari ka wazan, kanta slip | **Kanta** → doosra wazan → slip print | Net wazan khud; "Kharid banayein" se form bhar jata hai |
| 6 | Kharid: bardana + namee katoti, rate fi maund, Arhti commission, mazdoori | **Paddy Purchase** → Save + Slip Print | Slip #, khata mein Jama, peshgi/adaigi adjust, stock mein paddy |
| 7 | Boriyan wapas | **Bardana** → "wapas aayi" | Party ka bori balance kam |
| 8 | Paddy ki adaigi | **Payments** (cash/bank/cheque) | Khata, Rokar, cheque tracker; bounce par khud wapas |
| 9 | Geeli paddy ki sukhai | **Sukhai (Drying)** | Wazan ki kami paddy stock se khud kam |
| 10 | Godown mein rakhna, fumigation | **Stock / Godown** → lots | Fumigation/purane stock ke alerts |
| 11 | Milling: chawal, toota, phak, toori | **Production** | Recovery %, head rice %, stock paddy → chawal |
| 12 | Bechna: local / export, sauda ke khilaf | **Sales & Billing** | Invoice/Commercial invoice, Packing list, **Gate Pass**, khata, stock kam |
| 13 | Wasooli | **Payments** (Party se liya) | Khata barabar, udhaar ki umar (ageing) |
| 14 | Rozana hisaab | **Cash Book / Rokar**, Dashboard | Cash/Bank opening-closing, alerts |
| 15 | Munafa aur laagat | **Reports** → Laagat (fi maund chawal kitne ka para), P&L · **Stats** | Variety/rate/recovery trends |
| 16 | Mahina band, season khatam | **Mill Settings** → Hisaab lock · **Reset / Naya Season** (carry forward) | Baqaya, stock, cash, boriyan, baqi sauda agle season mein |

## Modules

| Module | Kya karta hai |
|---|---|
| **Stats / Analytics** | Graphs: kharid vs sale, paddy aamad vs milling, recovery % trend, variety-wise paddy rate (Rs/maund), cash aamad vs kharch, kharche, variety mix, top 10 suppliers/customers, item-wise sale, variety-wise recovery — rozana / hafta-war / mahana. **Udhaar ki umar (ageing)** 0-30 / 31-60 / 61-90 / 90+ din (FIFO) |
| **Dashboard** | Season recovery %, aaj ki kharid/sale, cash/bank, kitna dena/lena, stock, aur alerts (cheques, fumigation, purana stock, machine service, manfi stock, baqaya mazdoori) |
| **Kanta (Weighbridge)** | Gaari andar → pehla wazan, bahar → doosra wazan, net khud, **Kanta slip** print, andar khari gaariyon ki list, public weighing **fee** (Rokar mein aamad), aur slip se seedha **Kharid banayein** (gross/tare/gaari khud bhar jate hain) |
| **Sauda / Contracts** | Sale aur kharid ke saude (booking): miqdar, rate fi kg/maund/MT, PKR ya USD/EUR/AED…, delivery ki muddat, payment terms. Bill/kharid saude se judte hi **rawana/baqi** progress khud, overdue alert, **Proforma / Sauda print**. Season close par baqi sauda aage chala jata hai |
| **Paddy Purchase** | Kanta parchi: gross/tare, **bardana katoti** (fi bag), **namee/quality katoti** (kul kg, kg fi maund ya %), moisture/broken/FM, rate fi maund, **Arhti commission**, **mazdoori katoti**, **mauqa par adaigi**. Slip number khud, **Slip print**. Khata Arhti ya Kisan ke naam (aap chunte hain) |
| **Parties** | Kisan, Arhti, Customer, Supplier, Transporter, Broker, Mazdoor, Bank — phone, CNIC, pata, **opening balance**. Naam badlein to har entry mein badal jata hai; ghalat spelling wali duplicate party **Merge**. WhatsApp par balance yaad-dihani |
| **Khata Statement** | Kisi bhi party ka khata — opening (B/F), har entry, **running balance**, closing. Print / WhatsApp / CSV |
| **Khata / Ledger** | Manual Jama/Banam entries (qarz, adjustment) + har party ka balance |
| **Payments & Cheques** | Adaigi/wasooli (Cash, Bank, Cheque, JazzCash/Easypaisa). Post-dated cheques ki list; **bounce** mark karne par raqam khata se khud hat jati hai. Raseed print |
| **Cash Book / Rokar** | Cash aur Bank ka opening → aamad → kharch → closing, khud banta hai. Owner capital, nikasi, cash↔bank transfer, qarz, kanta fee ki entries |
| **Production** | Milling batch: variety, process (Raw/Sella/Steam); list ka **har product output** ban kar aata hai (chawal, toota, by-products) + wastage → **recovery %** (chawal + toota), head rice %, hisaab se bahar wazan |
| **Products & Varieties** | Mill ka **maal** (Full Grain, Sella, Steam, Kanki, B1 Tota, Phak, Toori… jo chahein) aur paddy/chawal ki **varieties** (Super Basmati, 1121, 1509, nayi koi bhi). Owner/Munshi add, rename, inactive, merge karte hain — naya item khud Kharid, Production, Sale aur Stock mein aa jata hai. Kharid form se bhi seedha "＋ Nayi variety" |
| **Sukhai (Drying)** | Geeli paddy: sukhai se pehle/baad wazan aur moisture → kami khud paddy stock se kam (variety-wise), ausat kami % |
| **Bardana (Boriyan)** | Boriyan party ko di / wapas aayi / mill ne khareedi / istemal; kis party ke paas kitni boriyan; charge karein to khata mein |
| **Stock / Godown** | **Variety-wise stock khud**: kharid se paddy aati, milling mein lagti, chawal/kanki/bran/husk banti, sale mein jaati. Adjustments (opening, kami/izafa, boiler mein husk). Godown lots + fumigation/ageing |
| **Sales & Billing** | Invoice number khud, rate **fi maund, fi kg ya fi MT**, **USD/EUR/AED… + exchange rate** (khata hamesha Rupay mein), sauda se bill, export ki tafseel (LC, B/L, vessel, ports, container, packing), **Commercial Invoice + Packing List**, variety, bags, GST, mauqa par wasooli, stock check. **Invoice print** (raqam alfaz mein, Lakh/Crore) |
| **Labor & Wages** | Dihari / piece rate / monthly; advance katoti; adaigi Cash/Bank. Har mazdoor ka khata khud barabar hota hai |
| **Transport** | Kiraya, Arhti/Broker commission; Cash, Bank ya **Udhaar** (party ke khata mein) |
| **Machinery & Kharche** | Machine repair log, agli service, "repair mein" alert. Rozana kharche categories ke saath; diesel waghaira **udhaar** par (petrol pump ka khata) |
| **Tax & Zakat** | GST/withholding/advance tax records; Zakat assessment — "System se bharein" cash, bank, lena/dena khud bhar deta hai |
| **Reports** | **Laagat (costing)**: chawal fi maund kitne ka para (paddy + sukhai ki kami + kharche − by-products) vs ausat sale rate = munafa fi maund; munafa/nuqsan (GST ke baghair), variety-wise kharid, item-wise sale, process-wise recovery, kharche, mahana khulasa, sab se bare payables/receivables — sab printable |
| **Calculator** | Maund⇄kg, rate fi maund⇄fi kg, kharid, recovery, sale, kiraya, tax, zakat |
| **Owner** | Users & Roles (staff accounts, per-module permissions), Mill Settings + **Hisaab band (period lock)**, Activity Log (har tabdeeli ki **purani → nayi** value), Backup/Restore/CSV, Reset / Naya Season |

## Khata kaise kaam karta hai

Har party ka balance = **Jama (Credit) − Banam (Debit)**

| Balance | Matlab |
|---|---|
| **musbat (+)** | Mill ne party ko dena hai |
| **manfi (−)** | Party ne mill ko dena hai |

| Entry | Jama (Credit) | Banam (Debit) |
|---|---|---|
| Paddy kharid | kul raqam (commission samet, mazdoori katoti ke baad) | mauqa par adaigi |
| Sale bill | mauqa par wasooli | bill ki raqam |
| Payment — mill ne diya | | raqam |
| Payment — mill ne liya | raqam | |
| Mazdoori | kul mazdoori | adaigi (jab "Ada" mark ho) |
| Udhaar kharcha / repair / kiraya | raqam | |
| Opening balance | (+) wala | (−) wala |

Yeh sab entries database **khud** banata aur update karta hai. Khata kabhi register se alag nahi hota, kyunki auto entry sirf apni asal entry se badalti ya delete hoti hai.

**Peshgi (advance):** Kisan ya mazdoor ko advance **Payments** mein dein. Phir kharid mein usay "mauqa par adaigi" mein, ya mazdoori mein "advance katoti" ke ilawa, dobara na likhein.

## Roles

| Module | Owner | Munshi | Godown Incharge | Sales Staff |
|---|:-:|:-:|:-:|:-:|
| Kharid, Khata, Payments, Cash Book, Tax, Zakat | ✓ | ✓ | dekh | dekh |
| Production, Stock, Labor, Transport, Machinery, Kharche | ✓ | ✓ | ✓ | dekh |
| Sales, Parties | ✓ | ✓ | dekh | ✓ |
| Products & Varieties | ✓ | ✓ | dekh | dekh |
| Sukhai (Production ki ijazat) · Bardana (Stock ki ijazat) | ✓ | ✓ | ✓ | dekh |
| Kanta (Weighbridge) | ✓ | ✓ | ✓ | dekh |
| Sauda — sale / kharid | ✓ | ✓ / ✓ | dekh | ✓ / dekh |
| Users, Settings, Backup, Reset, Activity Log | ✓ | — | — | — |

Owner har user ke liye har module alag se **allow/deny** kar sakta hai. Yeh pabandiyan database (row-level security) mein lagu hain, sirf screen par nahi.

## Offline

- Ek dafa khulne ke baad app bina internet bhi khulti hai (service worker).
- Bina internet ki entry phone par save hoti hai ("Sync baqi"). Net aate hi khud server par chali jaati hai.
- Agar server koi entry qabool na kare (e.g. permission), to woh "failed" list mein dikhti hai. Wahan se dobara bhej sakte hain ya hata sakte hain. Baqi entries nahi rukti.

## Naya Season

**Reset / Naya Season → "balances aage le jayein"** chunein. Saari purani entries hat jaati hain, lekin yeh sab nayi opening ban jaati hain:

- Har party ka baqaya → **Opening Balance**
- Bacha hua stock → **Opening Stock**
- Cash aur bank → **Opening Balance**

Pehle **Full Backup** zaroor lein.

---

## Developers ke liye

- **Stack:** React 18 + Vite 5, Supabase (Postgres, Auth, Realtime, Edge Function), Vercel.
- **Database ka dimagh:** `supabase/schema.sql`
  - Har hisaab (net weight, raqam, recovery, invoice number) database triggers dobara nikalte hain, is liye CSV import ya purana app ghalat total save nahi kar sakta.
  - Stock, khata balance, rokar aur dashboard ke liye `get_*` report functions hain.

```bash
npm install
npm run dev        # local
npm run lint       # ESLint (0 warnings policy)
npm test           # unit tests (calculations, dates, CSV, offline queue, pagination)
npm run build      # production build + service worker
```

**Database tests:** `tests/sql/` — kisi bhi local PostgreSQL 15+ par:
```bash
createdb kk_test
psql -d kk_test -f tests/sql/supabase_stub.sql      # Supabase ke auth/roles ka chhota sa substitute
psql -d kk_test -f supabase/schema.sql
psql -d kk_test -f tests/sql/tests.sql              # aakhir mein "ALL TESTS PASSED"
```

**Files:**
- `supabase/schema.sql` — naya install
- `supabase/migration_07_v5_upgrade.sql` — v4 se upgrade
- `supabase/migration_02…06` — sirf bohat purane projects ke liye
- `supabase/functions/admin-create-user/` — Edge Function
