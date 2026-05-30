# 🗄️ Database Migration Guide - whatsapp_webhook_events

## ⚠️ المشكلة (The Problem)

عند محاولة تسجيل الدخول أو إضافة منتجات، تحصل على الخطأ:

```
قاعدة بيانات التاجر غير جاهزة، شغل migration الخاص whatsapp_webhook_events أولاً
```

السبب: جدول `whatsapp_webhook_events` غير موجود في قاعدة البيانات.

---

## ✅ الحل

### الطريقة 1: من Lovable Cloud (الأسهل) ⭐

1. **افتح مشروعك في Lovable**
   - اذهب إلى Settings → Database
   - أو من اللوحة الرئيسية: Database → SQL Editor

2. **انسخ SQL كامل:**
   - افتح الملف: `supabase/migrations/20260530170000_create_whatsapp_webhook_events.sql`
   - انسخ كل المحتوى

3. **شغّل في SQL Editor:**
   - الصق SQL في `SQL Editor` في Lovable
   - اضغط `Run` أو `Ctrl+Enter`
   - تأكد من أنه نجح (سيشتغل بدون أخطاء)

4. **التحقق:**
   - اذهب إلى `Database` → `Table Explorer`
   - يجب أن تشوف جدول جديد `whatsapp_webhook_events`

---

### الطريقة 2: من Supabase Dashboard

1. اذهب إلى https://app.supabase.com
2. افتح مشروعك
3. اذهب إلى `SQL Editor` في الجانب الأيسر
4. اضغط `New Query`
5. انسخ SQL كامل من الملف
6. اضغط `RUN`

---

### الطريقة 3: من Supabase CLI (للمتقدمين)

```bash
# تثبيت Supabase CLI
npm install -g supabase

# تسجيل الدخول
supabase login

# ربط المشروع
supabase link --project-ref <your-project-ref>

# تشغيل migrations
supabase db push
```

---

## 📊 ماذا يفعل هذا Migration؟

### ✅ ينشئ جدول `whatsapp_webhook_events` به:
- **id**: معرّف فريد (UUID)
- **source**: مصدر البيانات (botly افتراضياً)
- **event_type**: نوع الحدث (merchant, product, session)
- **provider**: اسم المزود (للتوافقية)
- **payload**: بيانات JSON للحدث
- **created_at**: وقت الإنشاء
- **received_at**: وقت الاستقبال
- **updated_at**: وقت آخر تحديث

### ✅ ينشئ الفهارس (Indexes) لـ:
- البحث السريع حسب source و event_type
- البحث حسب التاريخ
- البحث في JSON payload

### ✅ يفعّل الأمان (RLS):
- الجداول محمية بـ Row Level Security
- Admin و Service Role لديهم صلاحيات كاملة

### ✅ ينشئ trigger تلقائي:
- يحدّث `updated_at` تلقائياً عند أي تعديل

---

## 🧪 بعد تشغيل Migration

### اختبر تسجيل الدخول:
1. اذهب إلى `http://localhost:3000/auth`
2. ادخل رقم واتساب وكلمة مرور
3. يجب أن يشتغل بدون أخطاء

### اختبر إضافة منتج:
1. بعد الدخول اذهب إلى Dashboard
2. أضف منتج جديد
3. يجب أن يحفظ بدون مشاكل

---

## 🔍 معلومات إضافية

### البيانات المخزنة في الجدول:

**عند تسجيل تاجر جديد:**
```json
{
  "event_type": "botly_merchant",
  "payload": {
    "storeName": "متجري",
    "whatsapp": "+964791234567",
    "email": "store@example.com",
    "whatsappNormalized": "+964791234567"
  }
}
```

**عند إضافة منتج:**
```json
{
  "event_type": "botly_product",
  "payload": {
    "description": "حذاء أسود",
    "imageUrl": "https://...",
    "currentPrice": 50000,
    "currency": "IQD"
  }
}
```

**عند إنشاء جلسة:**
```json
{
  "event_type": "botly_session",
  "payload": {
    "merchantId": "uuid",
    "tokenHash": "sha256_hash",
    "expiresAt": "2026-06-30T..."
  }
}
```

---

## ⏱️ وقت التشغيل

- Migration يأخذ **أقل من ثانية** للتشغيل
- لا توجد downtime
- آمن تماماً على البيانات الموجودة

---

## 🆘 إذا حصل خطأ

**خطأ: جدول موجود بالفعل**
```
ERROR: relation "whatsapp_webhook_events" already exists
```
الحل: الجدول موجود بالفعل! لا تقلق، كل شيء OK

**خطأ: Permission denied**
```
ERROR: permission denied for table whatsapp_webhook_events
```
الحل: استخدم Service Role key من Supabase

**خطأ: JSON not supported**
الحل: تأكد من أن Supabase version حديث (عادة يكون)

---

## ✨ نصائح

✅ قم بتشغيل migration قبل النشر على Production  
✅ احفظ نسخة من الـ SQL في مكان آمن  
✅ تحقق من الأوقات في timestamp عند التصحيح

---

**Next Steps:**
1. ✅ شغّل migration
2. ✅ اختبر تسجيل الدخول
3. ✅ اختبر إضافة منتج
4. ✅ نشّر على production

