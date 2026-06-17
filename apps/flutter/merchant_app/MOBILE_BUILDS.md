# Mobile builds

## Android

GitHub Actions builds the merchant app on every push that touches this Flutter app.

Workflow:

```text
.github/workflows/flutter-merchant-android.yml
```

Outputs:

- `botlly-merchant-debug-apk`: install manually on Android for testing.
- `botlly-merchant-release-aab`: upload later to Google Play after adding production signing.

The workflow generates Android platform files on CI with:

```bash
flutter create --platforms=android .
```

Then it builds with:

```bash
flutter build apk --debug --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
flutter build appbundle --release --dart-define=BOTLLY_API_BASE_URL=https://bot-lly.tech
```

## iOS without a local Mac

Recommended path: Codemagic.

Why:

- It is built for Flutter mobile CI/CD.
- It provides hosted macOS machines.
- It supports automatic iOS code signing by connecting to App Store Connect.
- It can create the certificate and provisioning profile without requiring a local Mac.

Requirements that still come from Apple:

- Apple Developer Program membership.
- App Store Connect API key.
- Bundle identifier for the app, for example `tech.botlly.merchant`.
- TestFlight/App Store access if we want normal iPhone distribution.

Fallback option: Bitrise. It also has hosted iOS builds and a Manage iOS Code Signing step, but Codemagic is the cleaner first choice for this Flutter app.
