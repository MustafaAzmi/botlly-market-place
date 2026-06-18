# Mobile Builds

## Android

GitHub Actions builds the merchant app on every push that touches this Flutter app.

Workflow:

```text
.github/workflows/flutter-merchant-android.yml
```

Artifacts:

- `botlly-merchant-install-apk`: use this APK for direct install on Android phones and emulators.
- `botlly-merchant-debug-apk`: debug-only test build.
- `botlly-merchant-release-aab`: upload to Google Play after production signing is configured.

The workflow uses Flutter stable and generates Android files on CI:

```bash
flutter create --platforms=android --org tech.botlly .
python tool/configure_platforms.py
flutter build apk --release --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
flutter build appbundle --release --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
```

## iOS

The app now has an iOS build workflow that runs on a hosted macOS runner, so a local Mac is not required for compile verification.

Workflow:

```text
.github/workflows/flutter-merchant-ios.yml
```

Artifact:

- `botlly-merchant-ios-unsigned-app`: unsigned iOS `.app` bundle for CI verification.

The workflow uses Flutter stable and generates/configures iOS files on CI:

```bash
flutter create --platforms=ios --org tech.botlly .
python3 tool/configure_platforms.py
flutter build ios --release --no-codesign --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
```

## App Store Preparation

The repository includes:

- iOS permissions for camera, photo library, photo saving, and notifications.
- WhatsApp and WhatsApp Business URL schemes for iOS link launching.
- iOS notification entitlement generation.
- App Store export options template at `tool/ios_export_options_app_store.plist`.
- Bundle identifier `tech.botlly.merchant`.

To create a signed IPA for TestFlight or App Store, Apple still requires:

- Apple Developer Program membership.
- An App Store Connect app using bundle id `tech.botlly.merchant`.
- Signing certificate and provisioning profile.
- App Store Connect API key if the signing is automated in CI.

Recommended cloud signing options:

- GitHub Actions macOS runner with Apple signing secrets.
- Codemagic with App Store Connect automatic code signing.
- Bitrise with managed iOS code signing.
