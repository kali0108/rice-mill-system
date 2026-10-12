# Changelog

## v5.3.0 — Fasal ke baad ka poora process

- **Paddy Sukhai (Drying).**
  - Geeli paddy ka sukhai se pehle/baad ka wazan, moisture aur tareeqa (dhoop/dryer).
  - Kami khud paddy stock se kat jati hai (variety-wise). Ausat kami % bhi dikhta hai.
  - Laagat report mein shamil.
- **Bardana (Boriyan) ka hisaab.**
  - Boriyan party ko di, wapas aayi, mill ne khareedi, ya istemal huin.
  - Har party ke paas kitni boriyan hain, aur mill ka apna bori stock.
  - Charge karein to party ke khata mein khud jata hai.
  - Season close par boriyon ka hisaab bhi agle season mein jata hai.
- **Namee (moisture) katoti ka rule** (Mill Settings), jaise 14% se upar har 1% par 1 kg fi maund.
  - Kharid form mein moisture likhte hi katoti ka mashwara aata hai, aur ek click se lag jati hai.
- **Laagat (Costing) report:** chawal fi maund kitne ka para.
  - Paddy ki qeemat aur sukhai ki kami.
  - Mazdoori, kharche, machine aur transport.
  - By-products (phak/toori) ki qeemat minus.
  - Muqabla ausat sale rate se, aur munafa fi maund.
- **Gate Pass / Delivery Challan:** bina rate ke, driver aur gate ke liye.
- **Kharid register par "aamad ka khulasa":** variety-wise entries, maund, ausat rate aur ausat moisture.
- **README mein "Fasal se bazaar tak":** har asal kaam aur app mein us ki jagah, step-by-step.
- **Tests:**
  - SQL suite naye install aur v4 / v5.0 / v5.1 / v5.2 se upgrade, paanchon par pass; sab ka structure bilkul ek jaisa (78 functions, 82 triggers, 89 policies).
  - 42 unit tests pass.
  - Browser test ke paanchon hisse (A–E) pass, aur mobile + offline reload theek.

## v5.2.0 — Bari (national-level) mill ke liye: Stats, Sauda, Kanta, Export, Hisaab Lock, Audit

- **Stats / Analytics** (naya page, graphs ke saath). Muddat aur rozana / hafta-war / mahana chunein.
  - Kharid vs sale, paddy aamad vs milling, recovery % aur head-rice trend.
  - Variety-wise paddy rate (Rs/maund) ka trend, aur cash/bank aamad vs kharch.
  - Kharche category-wise, variety mix, top 10 suppliers aur customers, item-wise sale, variety-wise recovery.
  - KPI cards: ausat rate, recovery, munafa ka andaza, cash flow.
  - **Udhaar ki umar (ageing):** har party ka baqaya 0-30 / 31-60 / 61-90 / 90+ din mein (FIFO). Print aur CSV.
  - Dashboard par pichle 14 din ka graph.
- **Sauda / Contracts.**
  - Sale aur kharid ke saude: miqdar, rate (fi kg/maund/MT), currency + exchange rate, delivery ki muddat, payment terms.
  - Bill ya kharid banate waqt sauda chunein to rate aur maal khud bhar jate hain, aur rawana/baqi progress khud chalti hai.
  - Overdue alert, aur Proforma Invoice / Sauda print.
  - Season close (carry forward) par baqi sauda baqi miqdar ke saath agle season mein chala jata hai.
- **Kanta (Weighbridge).**
  - Do-wazan tareeqa: gaari andar par pehla wazan, bahar par doosra, net khud. Kanta slip print hoti hai.
  - Andar khari gaariyon ki list.
  - Public weighing fee seedhi Rokar mein aamad.
  - "Kharid banayein" se kharid form mein gross/tare/gaari khud bhar jaate hain.
- **Export.**
  - Rate fi metric ton, aur USD/EUR/GBP/AED/SAR/CNY + exchange rate. Khata aur reports hamesha Rupay mein.
  - LC, B/L, vessel, ports, destination, container, packing aur gross weight.
  - **Commercial Invoice** (dono currencies) aur **Packing List** print.
- **Hisaab band (Period lock).**
  - Owner ek tareekh set karta hai; us tak ki kisi bhi entry ko **koi bhi** (Owner samet) na daal sakta hai, na badal ya mita sakta hai.
  - Purane cheque ka clear/bounce aur purani mazdoori ki adaigi phir bhi ho sakti hai.
  - Database khud rokta hai.
- **Audit.** Activity Log ab har tabdeeli ki **purani aur nayi** value dikhata hai (kis ne, kab, kya badla).
- **Tests.**
  - SQL suite naye install aur v4 / v5.0 / v5.1 se upgrade, chaaron par pass. Chaaron ka structure bilkul ek jaisa hai (73 functions, 74 triggers, 81 policies).
  - 42 unit tests pass.
  - Browser test ke chaaron hisse (A–D) pass: Kanta se kharid, USD sauda se export bill + Commercial Invoice + Packing List, Stats page, lock, audit.

### Jo is version mein shamil NAHI (saaf bata dena zaroori hai)
- **Ek system mein kai mills/branches ka mila hua hisaab.** Har mill ab apni alag deployment chala sakti hai. Mila hua system banane ke liye security ka poora dhancha badalna parega, jo alag kaam hai.
- **FBR Digital Invoicing (PRAL API) se seedha jurna.** Invoice par NTN/STRN/GST hota hai, magar FBR ko khud nahi jata.
- **Kai naam wale bank accounts aur bank reconciliation.** Rokar mein abhi Cash aur ek "Bank" khaata hai.
- **Poora double-entry accounting (trial balance, balance sheet).** App mein party khata, Rokar aur P&L hai. Audited financial statements ke liye accountant / accounting software istemal karein (CSV export maujood hai).
- **Khud-ba-khud SMS.** Abhi WhatsApp links hain.
- **2-step login (MFA).**
- **Urdu (Nastaliq) script mein UI.** Abhi Roman Urdu / English hai.

## v5.1.0 — Products & Varieties (admin khud naya maal / variety add kare)

- **Naya page "Products & Varieties":**
  - Owner aur Munshi mill ka har **product** add kar sakte hain (jaise Sella Rice, Steam Rice, B1 Tota, Rice Polish).
  - Har product ki qisam hoti hai: chawal / toota / by-product / other.
  - Paddy/chawal ki har **variety** bhi add ho sakti hai (jaise Basmati 1847).
  - Rename, Inactive, Merge aur (agar istemal na hua ho to) Delete.
- **Naya item khud har jagah aa jata hai.** Kharid, Production, Sale, Stock adjustment aur Godown lots ke dropdowns mein.
  - Kharid ya production form se bhi seedha **"＋ Nayi variety"** add ho sakti hai (agar ijazat ho).
- **Production:** outputs ab fixed khane nahi. List ka har product apni line hai. Recovery = chawal + toota, aur yeh har product ki qisam ke hisaab se khud nikalta hai.
- **Stock:** har product apni qisam ke saath. Phak/toori jaisi cheezon ka stock variety ke baghair.
- **Naam badalna:** product ya variety ka naam badlein to purani kharid, production, sale aur stock entries (aur khata ki tafseel) mein bhi badal jata hai.
- **Merge:** ghalat spelling wali duplicate (jaise "Super Basmti") asal naam mein merge ho jati hai, stock samet.
- **Paddy product mehfooz:** iska naam/qisam nahi badalta. Paddy ki nayi qisam = nayi **variety**.
- **Purana data:**
  - Pehle se likhi gayi varieties aur items khud list mein aa jaate hain.
  - Purane production batches ke fixed khane output lines mein badal jaate hain (recovery wahi rehti hai).
- **Upgrade:** pichli v5 chala chuke hain to sirf naya `migration_07_v5_upgrade.sql` dobara chalayein (safe hai).
- **Tests:** Products ke naye SQL tests (permissions, rename, merge, delete-protection, recovery, stock). 39 unit tests. Browser test mein Owner ne naya product/variety add kiya, Munshi ne kharid form se variety add ki, aur Sales staff ko yeh option nahi mila.

## v5.0.0 — Mukammal rice mill system + security aur hisaab ki ghaltiyan theek

Live site upgrade karne ka tareeqa: DEPLOYMENT_GUIDE.md → **Part B**. Data mehfooz rehta hai.

### 🔴 Khatarnak security masle (foran upgrade karein)

1. **Bina login ke koi bhi poora data delete kar sakta tha.** `owner_reset_all_data()` anonymous visitor ke liye bhi chal jata tha, kyunki public "anon key" har website ke code mein hoti hai.
   - Wajah: `my_role() <> 'owner'` login na hone par NULL deta tha, aur NULL ko "galat" maan kar check chhoot jata tha.
   - Ab: check kabhi NULL nahi hota, aur anonymous ke liye yeh functions band hain.
2. **Koi bhi naya sign-up khud ko Owner bana sakta tha.** Sirf ek `update profiles set role='owner'` kafi tha. Ab role, status aur permissions sirf Owner ke functions badal sakte hain (column-level lock + database guard).
3. **Suspended user khud ko unsuspend ya Owner bana sakta tha.** Wajah wahi NULL wala bug tha. Theek.
4. **Owner khud ko demote ya suspend kar ke app lock kar sakta tha.** Ab yeh mumkin nahi, aur kam az kam ek active Owner hamesha rehta hai.
5. **Khata entries browser se jaali banai ya badli ja sakti thin.** Ab kharid, sale aur payment ki khata entry sirf apni asal entry se banti, badalti ya delete hoti hai. Andar ke database functions API se band hain.
6. **Invoice print mein naam baghair escaping ke HTML mein jaate thay.** Ab har cheez escape hoti hai.
7. **Sign Out:** pehle har device se logout hota tha; ab sirf is device se. Shared phone par sign out karte waqt mehfooz kiya hua data bhi saaf hota hai, aur sync na hui entries ki warning milti hai.

### 🟠 Hisaab aur data ki ghaltiyan

**Data aur tareekh**
- **1000 rows ki hadd:** Supabase ek baar mein 1000 rows deta hai.
  - Pehle: table bara hote hi khata balance, reports aur Full Backup chupke se adhoore ho jaate.
  - Ab: sab page-by-page parha jata hai, aur balances, stock, rokar aur dashboard database khud nikalta hai.
- **Tareekh:** pehle UTC mein ban rahi thi.
  - Pakistan mein raat 12 se subah 5 tak "kal" ki tareekh save hoti thi.
  - `addDays()` ek din peeche deta tha, jis se fumigation ki tareekhen ghalat aati thin.

**Offline aur save/delete**
- **Offline mode:**
  - Network fail hone par entry queue nahi hoti thi.
  - Sync na hui entry delete karne par wapas aa jaati thi, aur edit karne par edit gum ho jata tha.
  - Server ki ek reject hui entry baqi saari queue ko hamesha ke liye rok deti thi.
  - Page reload karne par app bina internet khulti hi nahi thi. Ab service worker hai.
- **Delete:**
  - Database mana kar de tab bhi screen se row hat jaati thi.
  - Delete bina tasdeeq ke ho jata tha. Ab confirm dialog hai.
- Save do dafa dabane se duplicate entry ban jaati thi, aur realtime ke saath ek row do dafa dikhti thi.

**Khata**
- **Bounced cheque** phir bhi khata mein gina jata tha.
- **Advance** do dafa katne ka khatra tha. Field ab "Mauqa par cash adaigi" hai, saath wazahat bhi.
- **Mazdoor ka advance** khata se kabhi clear nahi hota tha. Ab mazdoori bhi khata mein jaati hai.
- Ek hi party ke mukhtalif spelling ("Allah Ditta" / "allah ditta ") ke do alag khate ban jaate thay.

**Reports aur validation**
- **P&L** GST ko aamdani gin raha tha aur net mazdoori le raha tha.
- **Recovery %** kharidi gayi paddy par nikal rahi thi, mill ki gayi paddy par nahi.
- Forms 3250.5 jaisi decimal raqam reject karte thay, aur mouse scroll se number badal jata tha.
- Server-side validation nahi thi: Tare > Gross (manfi wazan) aur recovery > 100% bhi save ho jaate thay.

**CSV import/export**
- Excel mein Urdu naam kharab dikhte thay.
- Import mein cheque number ke shuru ke zero ud jaate thay.
- Export kiya hua ledger import karne se auto entries double ho jaati thin.
- Ajnabi column ya Excel ki DD/MM/YYYY tareekh se import fail hota tha.

**Database aur doosri ghaltiyan**
- `migration_03` purane projects par "policy already exists" error de kar ruk jaati thi.
- Kisi staff ka login Supabase se delete nahi hota tha (foreign key error).
- Owner ke sath kuch aur:
  - Server tak na pahunchne par login screen "Loading…" par atak jaati thi.
  - Offline shuru karne par user ki permissions khali hoti thin. Ab profile device par yaad rehti hai.
- Calculator: 0.1 + 0.2 = 0.30000000000000004, aur zero se taqseem par "NaN".
- Slip aur invoice numbers mein gap nahi aata (ghalat entry number "khati" nahi).

### 🟢 Naye features

**Kharid aur Sale**
- **Kharid:**
  - Bardana katoti (fi bag) aur namee/quality katoti (kul kg / kg fi maund / %).
  - Arhti commission aur mazdoori katoti.
  - Gaari number.
  - Khata Arhti ya Kisan ke naam (aap chunein).
  - **Kanta Parchi print.**
  - "Rate baad mein" (rate 0) bhi ho sakta hai.
- **Sale:**
  - Rate fi maund ya fi kg, variety, bags, mauqa par wasooli.
  - Stock check.
  - **Invoice print** — raqam alfaz mein (Lakh/Crore), mill ka NTN/STRN.

**Khata aur paisa**
- **Parties:**
  - Phone, CNIC, pata, opening balance.
  - Naam badalne par har jagah update.
  - Duplicate parties **Merge**.
  - WhatsApp par balance reminder.
- **Khata Statement:** running balance, opening B/F, print, CSV.
- **Cash Book / Rokar:**
  - Cash aur Bank ka opening/closing, khud banta hai.
  - Capital, nikasi, cash↔bank transfer, qarz, kanta fee.
- **Udhaar:** diesel, repair aur kiraya supplier/transporter ke khata mein.
- **Payment raseed print** aur "poora baqaya ada karein" button.

**Mill**
- **Stock:**
  - Variety-wise khud hisaab: kharid → milling → chawal, Kanki 25/50/100%, phak, toori → sale.
  - Adjustments (opening, kami/izafa, boiler mein husk).
  - Godown lots ka "Khali" status aur "Fumigation aaj" button.
- **Production:** variety, Steam process, head rice %, hisaab se bahar wazan ki warning, paddy stock check.
- **Mazdoori:** monthly salary, adaigi ki tareekh aur tareeqa, mazdoor-wise khulasa.
- **Machinery:** "repair mein" aur service-due alerts dashboard par.

**Reports aur Dashboard**
- **Reports:**
  - Variety-wise kharid aur item-wise sale (avg rate).
  - Process-wise recovery, kharchon ki categories, mahana khulasa.
  - Sab se bare lena/dena.
  - Har report print ho sakti hai.
- **Dashboard:**
  - Season recovery, cash/bank, paddy aur chawal stock.
  - Alerts: cheques, fumigation, purana stock, machine service, manfi stock, baqaya mazdoori.

**Owner aur app**
- **Owner ke liye:**
  - Mill Settings (naam, pata, NTN, season, alerts ke din, number prefix).
  - Staff ke login email dikhte hain, account delete ho sakta hai.
  - Backup se **Restore**.
  - **Naya Season** reset, jis mein balances, stock aur cash carry forward hote hain.
- **Har user:** "Mera Account" se apna password badal sakta hai.
- **App:**
  - Install-able app (Add to Home Screen), mobile drawer menu.
  - Naye version ka "Update Karein" banner.
  - Har list mein muddat (aaj, hafta, mahina, season…), talash aur totals.

### ✅ Kaise test kiya gaya
- **SQL test-suite** (~100 checks, `tests/sql/tests.sql`), naye install aur v4 se upgrade, dono par pass. Yeh har role ke tor par chalti hai: Owner, Munshi, Godown, Sales, pending aur anonymous hacker.
- **Database barabari:** naya install aur upgrade kiya hua database bilkul ek jaise hain (tables, functions, permissions, policies, triggers).
- **migration_07:** asli v4 data par sahi nateeje, dobara chalane par koi tabdeeli nahi.
- **Code:** 35 unit tests, ESLint (0 warnings), production build, Edge Function ka Deno type-check.
- **Browser test (Chromium)** — asli app, asli PostgREST (Supabase ka engine):
  - Owner signup se le kar kharid, payment, bounced cheque, statement, production, sale + invoice, stock, mazdoori, udhaar, rokar, reports, Munshi/Sales permissions, offline entry + sync, delete, season reset aur backup restore tak.
  - Koi console error ya server error nahi aaya.
  - Mobile screen par layout check hua, aur bina internet page reload karne par app khuli.
- **Jo local test nahi ho saka:**
  - Supabase ka asli Realtime server. Code standard hai; agar realtime na bhi chale to app har 3 minute aur screen par wapas aane par khud refresh karti hai.
  - Asli Supabase Edge runtime. Function type-checked hai, aur wahi logic local stand-in par chala.
