# 🚀 دليل النشر — Botly

دليل خطوة بخطوة لتشغيل المنصة على الإنتاج. كل القيم السرية تنحط كـ
**Environment Variables** على منصة النشر (Netlify) — **مو بالكود**.

---

## 1) متغيرات البيئة المطلوبة

على Netlify: **Site configuration → Environment variables → Add a variable**

### قاعدة البيانات (Supabase)
| المتغير | من وين تجيبه |
|---------|--------------|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | نفس الصفحة → `anon` / `publishable` key |
| `SUPABASE_SERVICE_ROLE_KEY` | نفس الصفحة → `service_role` key ⚠️ سري |
| `VITE_SUPABASE_URL` | نفس Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | نفس publishable key |
| `VITE_SUPABASE_PROJECT_ID` | معرّف المشروع |

### واتساب (WhatsApp Cloud API)
| المتغير | القيمة / المصدر | الحالة |
|---------|-----------------|--------|
| `WHATSAPP_PHONE_NUMBER_ID` | `982535121605582` | ✅ جاهز |
| `WHATSAPP_WABA_ID` | `25752676937730999` | ✅ جاهز |
| `WHATSAPP_ACCESS_TOKEN` | توكن دائم من System User | ⚠️ يجب التأكد |
| `WHATSAPP_APP_SECRET` | App settings → Basic → App Secret | ⬜ مطلوب |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | `botly_093a41d4313b1ca5c98d59662159d843` | ✅ مُولّد |

### الذكاء الاصطناعي (OpenAI)
| المتغير | من وين |
|---------|--------|
| `OPENAI_API_KEY` | platform.openai.com → API keys |
| `OPENAI_MODEL` | `gpt-4.1-mini` |

### Meta OAuth (استيراد منشورات إنستغرام/فيسبوك)
| المتغير | من وين |
|---------|--------|
| `META_OAUTH_APP_ID` | developers.facebook.com → App settings → Basic → App ID |
| `META_OAUTH_APP_SECRET` | نفس App Secret حق واتساب |
| `META_OAUTH_REDIRECT_URI` | `https://www.bot-lly.tech/api/auth/meta/callback` |

### مهام مجدولة (Cron)
| المتغير | القيمة |
|---------|--------|
| `CRON_SECRET` | `e7d1ef661965b530e53167cca1e1e53c9180fcccaa431f5b` (أو أي نص عشوائي) |

---

## 2) إعداد Webhook واتساب

في **developers.facebook.com → تطبيقك → Use cases → WhatsApp → Configuration**:

1. **Callback URL:** `https://www.bot-lly.tech/api/whatsapp/webhook`
2. **Verify token:** `botly_093a41d4313b1ca5c98d59662159d843`
3. اضغط **Verify and Save**
4. تحت **Webhook fields** فعّل ✅ `messages`

---

## 3) تشغيل migrations قاعدة البيانات

في Supabase → SQL Editor، شغّل ملفات `supabase/migrations/` بالترتيب:

1. `20260527235248_*.sql` — الجداول الأساسية
2. `20260527235314_*.sql` — دالة set_updated_at
3. `20260601100000_social_commerce_search.sql` — فهارس البحث pg_trgm
4. `20260601200000_merchant_visibility_controls.sql` — تحكّم ظهور المتاجر

---

## 4) أول دخول للأدمن

- الرابط: `/admin/login`
- الواتساب الافتراضي: `07836653453`
- كلمة المرور الافتراضية: `123456`

> ⚠️ **غيّر كلمة المرور فوراً بعد أول دخول** عبر صفحة تغيير كلمة المرور.

---

## 5) التحقق من التشغيل

- [ ] فتح `/admin/login` والدخول
- [ ] إرسال رسالة واتساب للرقم → البوت يرد
- [ ] ربط حساب إنستغرام من داشبورد التاجر → استيراد المنشورات
- [ ] مراجعة المنتجات المستوردة في `/dashboard/review`
- [ ] إرسال broadcast من `/admin/broadcasts`

---

## 6) اختبار التوكن يدوياً (اختياري)

```bash
curl "https://graph.facebook.com/v24.0/982535121605582?fields=verified_name,display_phone_number,quality_rating&access_token=YOUR_TOKEN"
```

إذا رجّع اسم المتجر = التوكن شغّال ✅
