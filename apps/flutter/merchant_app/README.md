# Botly Merchant Flutter App

تطبيق Flutter مستقل للتاجر، مبني كبداية موازية لتفاصيل واجهة الويب الحالية:

- تسجيل دخول وإنشاء حساب للتاجر.
- لوحة ملخص المنتجات والطلبات ونسبة اكتمال صفحة المتجر.
- إدارة المنتجات مع البحث، الإضافة، التعديل، والحذف.
- صفحة طلبات التاجر.
- صفحة بيانات المتجر: الاسم، واتساب، المحافظة، الوصف، العنوان، ورقم التوصيل.

## التشغيل

```bash
cd apps/flutter/merchant_app
flutter pub get
flutter run --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
```

## Android و iPhone

هذا المجلد يحتوي كود Flutter وملف `pubspec.yaml`. إذا لم تكن مجلدات `android/` و`ios/` مولدة بعد على جهازك، شغل:

```bash
flutter create .
flutter pub get
flutter run --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
```

## الربط

التطبيق مربوط بالباكند عبر endpoint في موقع الويب:

```text
POST /api/merchant/mobile
```

هذا endpoint يستدعي نفس دوال التاجر المستخدمة في الويب، مثل تسجيل الدخول، الداشبورد، المنتجات، الطلبات، وتحديث صفحة المتجر.
