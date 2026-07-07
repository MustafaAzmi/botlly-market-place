# Botlly Flutter Mobile Apps

This folder contains three separate Flutter apps that connect to the existing Botlly website backend:

| Role | Flutter app | Android package | iOS bundle id | API endpoint |
| --- | --- | --- | --- | --- |
| Customer | `customer_app` | `tech.botlly.customer` | `tech.botlly.customer` | `/api/customer/mobile` |
| Merchant | `merchant_app` | `tech.botlly.merchant` | `tech.botlly.merchant` | `/api/merchant/mobile` |
| Fitter | `fitter_app` | `tech.botlly.fitter` | `tech.botlly.fitter` | `/api/fitter/mobile` |

The mobile apps do not use WebView. They are native Flutter screens calling the same production backend at:

```text
https://bot-lly.tech
```

## GitHub Build Artifacts

After pushing to `main`, GitHub Actions builds installable Android APKs and unsigned iOS apps:

| Workflow | Artifacts |
| --- | --- |
| `Flutter Customer and Fitter Android` | `botlly-customer-install-apk`, `botlly-fitter-install-apk` |
| `Flutter Customer and Fitter iOS` | `botlly-customer-ios-unsigned-app`, `botlly-fitter-ios-unsigned-app` |
| `Flutter Merchant Android` | `botlly-merchant-install-apk`, `botlly-merchant-release-aab` |
| `Flutter Merchant iOS` | `botlly-merchant-ios-unsigned-app` |

Android APK artifacts can be installed directly on test phones.

iOS artifacts are unsigned compile outputs. Installing on iPhone still requires Apple signing through Apple Developer, TestFlight, Codemagic, Bitrise, or GitHub Actions with App Store Connect secrets.

## Local Build Commands

Run these from the app directory.

Customer:

```bash
cd apps/flutter/customer_app
flutter create --platforms=android,ios --org tech.botlly .
python tool/configure_platforms.py
flutter pub get
flutter build apk --release --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
flutter build ios --release --no-codesign --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
```

Merchant:

```bash
cd apps/flutter/merchant_app
flutter create --platforms=android,ios --org tech.botlly .
python tool/configure_platforms.py
flutter pub get
flutter build apk --release --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
flutter build ios --release --no-codesign --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
```

Fitter:

```bash
cd apps/flutter/fitter_app
flutter create --platforms=android,ios --org tech.botlly .
python tool/configure_platforms.py
flutter pub get
flutter build apk --release --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
flutter build ios --release --no-codesign --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
```

## Notes

- Flutter SDK is required for local builds.
- iOS builds require macOS and Xcode.
- Production iOS installation requires code signing.
- The app source is kept small; Android and iOS native folders are generated during CI.
