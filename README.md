# Botly — منصة التجارة الذكية عبر واتساب

مشروع إدارة متاجر وتجار إلكتروني عبر بوت واتساب، يشمل:

- **صفحة تسويقية** (Landing Page) لجذب التجار
- **لوحة تحكم الأدمن** لإدارة المتاجر، الباقات، شركات التوصيل، والرسائل الجماعية
- **نظام مصادقة** مبدئي للأدمن (جلسة client-side)
- **ربط قاعدة بيانات** عبر Lovable Cloud (Supabase)

---

## 🛠 التقنيات المستخدمة

| التقنية | الاستخدام |
|---------|-----------|
| **React 19 + TypeScript** | الواجهة الأمامية |
| **TanStack Start** | إطار العمل الكامل (routing + SSR + server functions) |
| **TanStack Query** | جلب البيانات وإدارة الحالة |
| **Tailwind CSS v4** | التنسيق |
| **shadcn/ui** | المكونات الأساسية (أزرار، جداول، نماذج...) |
| **Recharts** | الرسوم البيانية في داشبورد الأدمن |
| **Supabase (Lovable Cloud)** | قاعدة البيانات والمصادقة |
| **Zod** | التحقق من المدخلات في server functions |

---

## 📁 هيكل المشروع

```
src/
├── components/          # مكونات React (shadcn/ui + custom)
│   ├── layout/          # AdminLayout, MarketingHeader, Logo...
│   └── ui/              # مكونات shadcn الأساسية
├── hooks/               # React hooks مخصصة
├── i18n/                # نظام الترجمة (عربي/إنجليزي)
├── integrations/
│   └── supabase/        # عملاء Supabase (browser + server + admin)
├── lib/
│   ├── admin.functions.ts   # Server functions (CRUD)
│   ├── adminTypes.ts        # أنواع البيانات المشتركة
│   ├── adminMockData.ts     # بيانات تجريبية (يتم استبدالها تدريجياً)
│   └── adminGuard.ts        # حماية صفحات الأدمن
├── routes/              # ملفات التوجيه (file-based routing)
│   ├── __root.tsx       # التخطيط الجذري
│   ├── index.tsx        # الصفحة الرئيسية (Landing)
│   └── admin/           # صفحات لوحة الأدمن
│       ├── login.tsx
│       ├── index.tsx    # Dashboard
│       ├── stores.tsx
│       ├── packages.tsx
│       ├── delivery.tsx
│       └── broadcasts.tsx
├── router.tsx           # إعداد TanStack Router
├── start.ts             # إعداد TanStack Start
└── styles.css           # تصميم CSS + tokens

supabase/
├── migrations/          # ملفات SQL لإنشاء الجداول
│   ├── 20260527235248_*.sql   # إنشاء الجداول + triggers + RLS
│   └── 20260527235314_*.sql   # دالة set_updated_at
└── config.toml          # إعدادات Supabase
```

---

## 🗄 قاعدة البيانات (Lovable Cloud / Supabase)

### ⚠️ تنبيه مهم
**GitHub لا ينقل البيانات الفعلية** — ينقل فقط كود SQL الذي يعرف الجداول (`migrations/`). عند نشر المشروع في مكان جديد، **يجب إعادة إنشاء الجداول وإدخال البيانات من جديد**.

### الجداول الموجودة

| الجدول | الغرض |
|--------|-------|
| `admin_stores` | المتاجر المسجلة |
| `payment_packages` | باقات الاشتراك الشهرية |
| `delivery_companies` | شركات التوصيل |
| `broadcasts` | الرسائل الجماعية المرسلة |

### كيفية إعادة إنشاء قاعدة البيانات

#### الطريقة 1: من لوحة Lovable Cloud (الأسهل)

1. افتح المشروع في **Lovable**
2. اذهب إلى **Connectors → Lovable Cloud**
3. فعّل Lovable Cloud — سيتم إنشاء مشروع Supabase تلقائياً
4. اذهب إلى **Database Migrations**
5. انسخ محتوى ملفات `supabase/migrations/*.sql` من هذا المستودع
6. الصقها في محرر SQL في Lovable Cloud وشغّلها

#### الطريقة 2: من Supabase CLI (للمتقدمين)

```bash
# تثبيت Supabase CLI
npm install -g supabase

# تسجيل الدخول
supabase login

# ربط المشروع (استبدل ref بمشروعك)
supabase link --project-ref <project-ref>

# تشغيل migrations
supabase db push
```

#### الطريقة 3: يدوياً من SQL Editor

افتح **SQL Editor** في Supabase Dashboard وشغّل الأوامر التالية بالترتيب:

1. انسخ محتوى `supabase/migrations/20260527235248_*.sql` (إنشاء الجداول)
2. انسخ محتوى `supabase/migrations/20260527235314_*.sql` (دالة set_updated_at)

---

## 🔐 متغيرات البيئة (Environment Variables)

هذا المشروع يستخدم **Lovable Cloud** تلقائياً. المتغيرات التالية يجب توفرها:

### المتغيرات العامة (Client-side)

| المتغير | المصدر |
|---------|--------|
| `VITE_SUPABASE_URL` | Lovable Cloud (يتم توليده تلقائياً) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Lovable Cloud (يتم توليده تلقائياً) |

### المتغيرات السرية (Server-side)

| المتغير | الاستخدام |
|---------|-----------|
| `SUPABASE_URL` | Server functions |
| `SUPABASE_PUBLISHABLE_KEY` | Server functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin operations (bypass RLS) |

> **ملاحظة:** إذا نشرت هذا المشروع خارج Lovable (مثلاً على Vercel أو Netlify)، ستحتاج إلى:
> 1. إنشاء مشروع Supabase جديد
> 2. نسخ المفاتيح من إعدادات المشروع
> 3. إضافتها كـ Environment Variables في منصة النشر

---

## 🚀 تشغيل المشروع محلياً

### المتطلبات
- [Bun](https://bun.sh) (مفضل) أو Node.js 20+

### الخطوات

```bash
# 1. استنساخ المستودع
git clone <repo-url>
cd <project-folder>

# 2. تثبيت التبعيات
bun install

# 3. تشغيل خادم التطوير
bun run dev
```

الموقع يعمل على: `http://localhost:3000`

### لوحة الأدمن
- الدخول: `/admin/login`
- البيانات الافتراضية للدخول:
  - البريد: `mustafa.azmi.mustafa@gmail.com`
  - الهاتف: `07836653453`
  - أي كلمة مرور (4 أحرف على الأقل)

> ⚠️ **هذه طريقة مؤقتة** — TODO: ربطها بـ `supabase.auth` + جدول `user_roles`.

---

## 🔄 سير العمل عند النشر من GitHub

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   GitHub Repo   │────▶│   Lovable Cloud  │────▶│   Supabase DB   │
│   (كود فقط)     │     │  (Build & Host)  │     │ (جداول + بيانات)│
└─────────────────┘     └──────────────────┘     └─────────────────┘

ما ينتقل عبر GitHub:
  ✅ src/ (كل الكود)
  ✅ supabase/migrations/ (تعريف الجداول SQL)
  ✅ package.json + الإعدادات

ما لا ينتقل (يجب إعداده من جديد):
  ❌ البيانات الفعلية (rows في الجداول)
  ❌ الملفات المرفوعة (Storage)
  ❌ إعدادات Auth والمستخدمين المسجلين
  ❌ Secrets / API Keys
```

---

## 🛡 أمان هام

1. **RLS (Row Level Security)**: جميع الجداول مغلقة بـ `deny all` — لا يمكن الوصول لها مباشرة من المتصفح. كل العمليات تمر عبر `server functions` باستخدام `supabaseAdmin`.

2. **TODO — تحسينات أمنية مقترحة:**
   - استبدال `sessionStorage` guard بـ `supabase.auth` حقيقي
   - إنشاء جدول `user_roles` + دالة `has_role()`
   - إضافة `requireSupabaseAuth` middleware + فحص `has_role(auth.uid(), 'admin')`
   - إزالة `ADMIN_CREDENTIALS` الثابتة من الكود

---

## 📄 الملفات المهمة عند النقل

تأكد من نقل هذه الملفات إلى GitHub:

```
✅ src/                       (كل الكود)
✅ supabase/migrations/       (تعريف الجداول)
✅ package.json + bun.lock    (التبعيات)
✅ vite.config.ts             (إعدادات Vite)
✅ tsconfig.json              (إعدادات TypeScript)
✅ public/                    (الأصول الثابتة)
✅ README.md                  (هذا الملف)

❌ .env                       (لا تنقله — يحتوي على secrets)
❌ node_modules/              (يتم تثبيتها من package.json)
❌ dist/ أو build/            (يتم بناؤها عند النشر)
```

أضف هذه إلى `.gitignore`:
```
node_modules
dist
.env
.env.local
.DS_Store
```

---

## 🆘 دعم فني

إذا واجهت أي مشكلة بعد النقل:

1. تحقق من أن Lovable Cloud مفعل في مشروعك
2. تأكد من تشغيل migrations في قاعدة البيانات
3. تأكد من وجود متغيرات البيئة الصحيحة
4. راجع Console في المتصفح لأي أخطاء
5. تحقق من Network tab لطلبات API الفاشلة

---

## 📝 ملاحظات التطوير

- المشروع يستخدم **file-based routing** — أي ملف في `src/routes/` يصبح route تلقائياً
- `src/lib/admin.functions.ts` تحتوي على كل CRUD operations كـ `createServerFn`
- البيانات التجريبية في `src/lib/adminMockData.ts` تُستخدم كـ fallback إذا فشل الاتصال بقاعدة البيانات
- اللغة الافتراضية هي **العربية** (RTL)
