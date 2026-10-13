# Jatala Rice Mills v5 — Deployment Guide (Supabase + Vercel)

Do raaste hain:
- **Part A** — bilkul naya setup (pehli dafa).
- **Part B** — aap ki site pehle se live hai (v4) aur aap ko v5 par upgrade karna hai. **Aap ka data mehfooz rehta hai.**

> Supabase dashboard ke menu ke naam waqt ke saath thore badal jaate hain — agar koi button bilkul isi naam se na mile to qareeb wala option dekhein.

---

## Part A — Naya setup (fresh install)

### A1. Supabase project banayein
supabase.com → New project → naam (e.g. `kanta-khata`) → mazboot database password → region (Pakistan ke qareeb: Singapore / Mumbai) → Create.

### A2. Database schema chalayein
1. Left menu → **SQL Editor** → **New query**.
2. `supabase/schema.sql` ki **poori file** copy kar ke paste karein → **Run**.
3. "Success" aana chahiye. (Yeh file ek hi transaction hai — agar beech mein error aaye to kuch bhi adhoora nahi bachta, dobara chala sakte hain.)

> `migration_02 … migration_07` files naye project ke liye **nahi** hain — `schema.sql` mein sab shamil hai.

### A3. Authentication settings
**Authentication → Sign In / Providers → Email**:
- **Confirm email: OFF** (warna Owner ka account bante hi login nahi hoga).

### A4. Edge Function deploy karein (staff accounts banane ke liye)
1. Left menu → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Function ka naam bilkul yeh rakhein: `admin-create-user`
3. `supabase/functions/admin-create-user/index.ts` ki poori file paste karein → **Deploy**.
4. Function ki settings mein **JWT verification ON** rehne dein (default).

`SUPABASE_URL` aur `SUPABASE_SERVICE_ROLE_KEY` Supabase khud function ko deta hai — aap ko kahin service key paste **nahi** karni. (Service key kabhi bhi app ya Vercel mein na daalein.)

### A5. API keys
**Project Settings → API** (ya **API Keys**) se do cheezein copy karein:
- **Project URL** — `https://xxxx.supabase.co`
- **anon / public key** (naye projects mein "Publishable key" — dono chalti hain)

### A6. (Optional) Apne computer par check karein
```bash
npm install
cp .env.example .env.local      # phir .env.local mein URL aur key daalein
npm run dev                     # http://localhost:5173
```

### A7. Vercel par deploy
1. Code GitHub par push karein (ya Vercel CLI se upload).
2. vercel.com → **Add New Project** → repo chunein. Framework: **Vite** (khud pehchan leta hai).
3. **Environment Variables** mein daalein:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon / publishable key
4. **Deploy**. (`vercel.json` already SPA routing aur offline service worker ke headers set karta hai.)

### A8. Pehla login = Owner
1. Live site kholen → pehli screen "Owner Account Banayein" hogi → apna naam/email/password.
2. **Foran baad:** Supabase → **Authentication → Sign In / Providers** → **"Allow new users to sign up" OFF** kar dein.
   Staff ke accounts Owner app ke andar **Users & Roles** se banata hai (yeh Edge Function se bante hain aur sign-up band hone par bhi chalte hain).
3. **Mill Settings** mein mill ka naam, pata, phone, NTN daalein (slip/invoice par chhapte hain) aur **Season shuru** ki tareekh.
4. **Products & Varieties** page par apni mill ka maal (jaise Sella, Steam, B1 Tota) aur varieties check kar lein — jo nahi chahiye unhein Inactive, jo naya hai woh add karein.
5. **Mill Settings → Namee katoti ka rule** apni mill ke hisaab se bharein (jaise 14% aur 1 kg fi maund).
6. Mahina/saal band karne ke baad **Mill Settings → Hisaab band (lock)** mein us ki aakhri tareekh daal dein.
7. Pehle din ka setup (sirf ek dafa):
   - **Parties** mein purane hisaab wali parties ka **Opening balance**.
   - **Stock → Stock Adjustment** mein godown ka **Opening Stock** (variety-wise).
   - **Cash Book** mein Cash aur Bank ka **Opening Balance**.

---

## Part B — Live site ko v4 se v5 par upgrade

### B1. Pehle backup (zaroori)
- App mein Owner login → **Import / Export → Full Backup** download karein.
- (Paid Supabase plan ho to Database → Backups bhi dekh lein.)

### B2. Kya purani migrations chali hui hain?
v5 upgrade ke liye database v4 par hona chahiye (yani `migration_02` se `migration_06` tak chal chuki hon, ya project v4 `schema.sql` se bana ho).
Agar yaqeen nahi to bas B3 chalayein — agar purani migrations baqi hongi to file khud saaf message de kar ruk jayegi ("Pehle migration_02 se migration_06 tak chalayein"), kuch nahi badlega.

### B3. migration_07 chalayein
**SQL Editor → New query** → `supabase/migration_07_v5_upgrade.sql` poori paste → **Run**.

Yeh kya karti hai:
- **Security holes band karti hai.** Yeh do sab se khatarnak hain:
  - Bina login koi bhi poora data delete kar sakta tha.
  - Koi bhi naya signup khud ko Owner bana sakta tha.
- **Naye columns, tables aur features add karti hai.**
- **Purane data ko naye hisaab se set karti hai:**
  - Har purani kharid/sale ko slip/invoice number.
  - Bounced cheques khata se nikal jaate hain.
  - Mazdoori ab mazdoor ke khata mein.
  - Ek hi party ke mukhtalif spelling wale khate ek ho jaate hain.

Yeh file ek transaction hai aur **dobara chalana bhi safe hai**.

> Note: v4 mein "Arhti ke zariye" wali kharid hamesha **Kisan** ke khata mein jaati thi. Purani entries wesi hi rehti hain. Nayi entries mein aap form par "Khata kis ke naam?" chun sakte hain (default: Arhti).

> **Pichli kisi bhi v5 zip (v5.0 – v5.3) ki files pehle hi chala chuke hain?** (Naye project par purani `schema.sql`, ya live site par purani `migration_07`.)
> Ab sirf yeh **naya `migration_07_v5_upgrade.sql`** chalayein — `schema.sql` dobara mat chalayein. Yeh safe hai, kuch nahi mitata, aur naye features (Products & Varieties, Stats, Sauda, Kanta, Export, Hisaab lock, Sukhai, Bardana, Laagat, Manager role, custom permissions, delete options) add kar deta hai — aur Reset wala "DELETE requires a WHERE clause" error bhi theek karta hai.

**Zaroori:** is version ke saath Edge Function `admin-create-user` bhi dobara deploy karein (Manager ko staff banane ki ijazat isi mein hai).

### B4. Edge Function update
**Edge Functions → admin-create-user** → code editor mein naya `index.ts` paste → **Deploy**. (Naye features: staff ke login email dikhana, account delete, behtar errors.)

### B5. Naya code deploy
GitHub par push karein (Vercel khud deploy karega) ya Vercel dashboard se **Redeploy**. Environment variables wahi rehte hain.

### B6. Public sign-up band karein
Authentication → Sign In / Providers → **Allow new users to sign up: OFF** (agar pehle se band nahi).

### B7. Har device par ek dafa
App khulne par upar "**App ka naya version aa gaya hai — Update Karein**" aaye to dabayein (ya page ek dafa refresh karein).

---

## Part C — Mobile par app ki tarah install
- **Android (Chrome):** site kholen → ⋮ menu → **Add to Home screen / Install app**.
- **iPhone (Safari):** Share → **Add to Home Screen**.

Ek dafa khulne ke baad app **bina internet ke bhi khulti hai**. Entries phone par save hoti hain aur internet aate hi khud server par chali jaati hain. Upar wali patti batati hai kitni entries baqi hain.

---

## Part D — Masle aur hal (Troubleshooting)

**"Database update nahi hua — migration_07 chalayein" / "column does not exist"**
Naya code purane database se baat kar raha hai. Part B3 chalayein.

**Staff account nahi banta / "Edge Function tak rabta nahi ho saka"**
1. Edge Functions mein `admin-create-user` maujood hai? Naam bilkul yahi ho (chhote huroof, beech mein dash).
2. Maujood hai to us ke **Logs** tab mein asal error dekhein.
3. Aap **Owner** account se login hain? Function doosron ko mana kar deta hai (jaan boojh kar).

**"Is kaam ki ijazat nahi (permission)"**
Us user ke role/permissions mein yeh module "Likh sakta" nahi. Owner → **Users & Roles → Permissions** se allow karein. Dekhna har approved user ke liye khula hai.

**"Yeh khata entry … se khud bani hai"**
Kharid/Sale/Payment/Mazdoori/udhaar kharche ki khata entries **asal entry se** bante hain — unhein usi page par edit/delete karein. (Is se khata kabhi register se alag nahi hota.)

**Stock manfi (negative) dikha raha hai**
Koi entry reh gayi hai — aksar opening stock, ya production/sale mein variety ka naam kharid se mukhtalif. Stock → Stock Adjustment se theek karein.

**Ek browser mein doosra user login karte hi pehla logout ho jata hai**
Yeh har website ka tareeqa hai — ek browser = ek login. Mukhtalif log apne apne phone/computer par baghair masle ke ek saath kaam karte hain. Khud test karna ho to Incognito window ya doosra browser istemal karein.

**Doosre user ki entry foran nazar nahi aati**
Realtime ke liye Supabase → Database → Publications (ya Replication) mein `supabase_realtime` ke andar tables honi chahiye — `schema.sql`/`migration_07` yeh khud karti hain. Is ke bawajood app har 3 minute mein aur screen par wapas aane par khud refresh karti hai.

**Owner ka password bhool gaya**
Supabase → Authentication → Users → apna email → password reset / naya password. Staff ke passwords Owner **Users & Roles → Password** se badal sakta hai.

**Kuch aur**
1. Browser console (F12 → Console) — asal error aksar wahan saaf likha hota hai.
2. Supabase → Edge Functions → Logs aur Database → Logs.
3. Vercel ke environment variables bilkul Supabase project wale hon (ghalat key se ajeeb errors aate hain). Variables badalne ke baad **Redeploy** zaroori hai.
