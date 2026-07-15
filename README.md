# NadirEdu

O'qituvchining o'zi uchun davomat va daromad hisob-kitob tizimi.
Har bir o'qituvchi o'z hisobini yaratadi va faqat o'z guruhlari, studentlari, jadvali,
davomati va to'lovlarini boshqaradi — boshqa hech kim (admin ham) ularni ko'rmaydi.

Next.js (App Router) + TypeScript + PostgreSQL + Prisma asosida qurilgan, Vercel'ga joylashga tayyor.

## Texnologiyalar

- **Frontend:** Next.js 14 (App Router), TypeScript, TailwindCSS, qo'lda yozilgan shadcn/ui uslubidagi komponentlar, Lucide Icons
- **Backend:** Next.js Server Actions + Route Handlers, PostgreSQL, Prisma ORM
- **Auth:** JWT (httpOnly cookie), bcrypt parol xeshlash — bitta rol, to'liq self-service ro'yxatdan o'tish (`/signup`)
- **Hisobotlar:** ExcelJS (.xlsx) va PDFKit (.pdf) orqali davomat/daromad hisobotlari, ustunlarni o'zi tanlab eksport qilish imkoniyati bilan
- **Deploy:** Vercel + Neon yoki Supabase (PostgreSQL)

## Ishlash tamoyili

Bitta hisob = bitta o'qituvchi. Admin yoki Super Admin yo'q. `/signup` orqali har kim o'z
hisobini ochadi, so'ng faqat o'ziga tegishli ma'lumotlarni ko'radi va boshqaradi:

- **Kurslarim** — narx shabloni (oylik narx, oyiga necha dars).
- **Guruhlarim** — kurs asosidagi guruh, xona nomi, haftalik jadval. Guruh ustiga bosilganda
  **Davomat jurnali** ochiladi: studentlar x sana grid, o'tgan kunlar uchun bosib davomat
  belgilanadi (Keldi / Kechikdi / Sababli kelmadi / Sababsiz kelmadi), kelajakdagi kunlar
  qulflangan (lock ikonkasi) holatda ko'rinadi.
- **Studentlarim** — har bir guruhga biriktirilgan studentlar ro'yxati.
- **Jadval** — kunlik/haftalik/oylik dars jadvali.
- **To'lov va hisobot** — bitta joyda: umumiy studentlar, oylik kutilayotgan summa, tanlangan davrda
  qancha ulush ishlanganini ko'rish (barcha guruhlar / bitta guruh / bitta student bo'yicha), va
  qaysi ustunlar chiqishini o'zi belgilab PDF/Excel yuklab olish — ekrandagi raqamlar bilan fayldagilar
  har doim mos keladi.
- **Profil** — shaxsiy ma'lumotlar, standart dars ulushi, parolni almashtirish.

## Eng muhim biznes qoidasi: davomat asosida o'qituvchi daromadi

`src/lib/attendance-payment.ts` faylida to'liq hujjatlashtirilgan va `src/lib/__tests__/attendance-payment.test.ts` orqali sinovdan o'tkazilgan:

- Har bir kelgan (yoki kechikkan) dars uchun o'qituvchiga to'liq ulush (masalan, 18 500 so'm) yoziladi.
- Student darsga kelmasa (sababli yoki sababsiz farqsiz), **ketma-ket 1- va 2-marta kelmagan darslar uchun ham ulush to'liq yoziladi**.
- Biroq **ketma-ket 3-marta kelmagan darsdan boshlab**, shu ketma-ketlik davom etar ekan, o'qituvchiga pul yozilmaydi (0 so'm).
- Student darsga qaytishi bilan (kelsa yoki kechiksa ham) hisoblagich darhol nolga tushadi va to'liq to'lov davom etadi.

Bu qoida `computeEarningsForHistory` funksiyasi orqali har safar davomat belgilanganda studentning **butun tarixi** bo'yicha qayta hisoblanadi (`recomputeStudentEarnings`), shuning uchun orqaga qaytib xatoni tuzatish ham to'g'ri natija beradi.

## Loyihani ishga tushirish

```bash
npm install
cp .env.example .env   # DATABASE_URL, DIRECT_URL, JWT_SECRET larni to'ldiring
npm run db:migrate     # Prisma migratsiyalarini yaratadi va qo'llaydi
npm run db:seed        # Demo ma'lumotlar (1 ta demo o'qituvchi, guruhlar, studentlar, davomat tarixi)
npm run dev
```

Ilova `http://localhost:3000` da ishga tushadi va `/login` sahifasiga yo'naltiradi. Yangi
foydalanuvchi login sahifasidagi "Ro'yxatdan o'tish" havolasi orqali `/signup`da o'z hisobini
ochishi mumkin.

Seed skripti tugagach terminalda ko'rsatiladigan demo login/parol:

- `.env` dagi `SEED_TEACHER_USERNAME` / `SEED_TEACHER_PASSWORD` (standart: `teacher1` / `Teacher123!`)

**Muhim:** ushbu ishlab chiqish muhitida (sandbox) npm registry'ga tarmoq ruxsati yo'q edi, shuning uchun `npm install` shu yerda ishga tushirilmadi. Loyihani birinchi marta ishga tushirishda internetga ulangan mashinada (yoki Vercel build muhitida) `npm install` avtomatik barcha paketlarni o'rnatadi. Core biznes-logika (`attendance-payment.ts`) esa Node ning ichki `--experimental-strip-types --test` rejimi orqali paket o'rnatmasdan haqiqiy ishga tushirilib tekshirildi — barcha 8 ta test muvaffaqiyatli o'tdi.

## Testlar

```bash
npm run test        # davomat/to'lov algoritmi bo'yicha unit testlar
npm run typecheck   # TypeScript tekshiruvi
npm run build       # production build
```

## Vercel + Neon/Supabase'ga joylash

1. **Ma'lumotlar bazasi:** [Neon](https://neon.tech) yoki [Supabase](https://supabase.com) da yangi PostgreSQL loyihasi yarating.
   - Neon: pooled connection string'ni `DATABASE_URL` ga, unpooled (direct) connection string'ni `DIRECT_URL` ga qo'ying.
   - Supabase: pgbouncer (port 6543) connection string'ni `DATABASE_URL` ga, to'g'ridan-to'g'ri (port 5432) connection string'ni `DIRECT_URL` ga qo'ying.
2. **Vercel loyihasi:** repo'ni Vercel'ga ulang, Environment Variables bo'limida `.env.example` dagi barcha o'zgaruvchilarni kiriting (`JWT_SECRET` ni `openssl rand -base64 48` bilan generatsiya qiling).
3. **Build buyrug'i:** Vercel avtomatik `next build` ni ishga tushiradi; `postinstall` skripti `prisma generate` ni avtomatik chaqiradi.
4. **Migratsiya:** birinchi deploydan oldin (yoki CI bosqichida) `npx prisma migrate deploy` ni ishga tushiring — bu production bazada barcha jadvallarni yaratadi.
5. **Seed (ixtiyoriy):** production uchun `npm run db:seed` odatda kerak emas — foydalanuvchilar `/signup` orqali o'zlari ro'yxatdan o'tadi.

## Papka tuzilishi

```
prisma/schema.prisma        — bitta-tenant ma'lumotlar bazasi sxemasi (foreign key, index, soft delete)
prisma/seed.ts               — demo o'qituvchi + ma'lumotlar generatori
src/lib/                     — auth, attendance-payment algoritmi, validatsiyalar, hisobot generatorlari
src/app/actions/             — barcha Server Actions (CRUD, davomat, to'lovlar, statistika) — har biri joriy o'qituvchining userId'siga cheklangan
src/app/api/                 — login/signup/logout va PDF/Excel eksport route handlerlari
src/app/dashboard/           — yagona (rolsiz) dashboard sahifalari: groups, students, courses, schedule, payments, reports, profile
src/components/ui/           — qayta ishlatiladigan UI primitivlar (shadcn/ui uslubida, qo'lda yozilgan)
src/components/features/     — har bir modul uchun to'liq client komponentlar (CRUD, Davomat jurnali, hisobotlar)
src/components/layout/       — sidebar, header, navigatsiya konfiguratsiyasi
```

## Kod sifati bo'yicha eslatmalar

- Har bir Server Action `requireSession()` orqali autentifikatsiyani tekshiradi va barcha
  so'rovlar `userId`ga qat'iy cheklangan — bir o'qituvchi boshqasining ma'lumotini hech qachon
  ko'ra olmaydi yoki o'zgartira olmaydi.
- Soft delete (`deletedAt`) barcha asosiy modellarda qo'llanilgan; hech narsa jismonan o'chirilmaydi.
- Har bir yozuvda `createdAt` / `updatedAt` mavjud.
- Xona/guruh jadval to'qnashuvi (`assertNoRoomConflict`) o'qituvchining o'z guruhlari ichida avtomatik tekshiriladi.
