# iOS Readiness Audit

Audit date: 2026-06-18  
Commit audited: `bd45bb1970d7f6a3e284fb6433e9029f0d1d1f7c`  
iOS CI run: `27755136244` - success  
iOS artifact: `botlly-merchant-ios-unsigned-app`

## Summary

The Flutter merchant app is compile-ready for iOS from the same Android codebase. The GitHub Actions iOS workflow generates the iOS project with Flutter stable, applies iOS configuration, installs CocoaPods, runs analyze, builds a release iOS app without code signing, and uploads the unsigned `.app` artifact.

The remaining iOS work is mostly release/distribution work: Apple signing, production APNs setup, App Store metadata, privacy declarations, and real-device runtime testing.

## Checks

| Area | Status | Evidence | Remaining risk / fix |
| --- | --- | --- | --- |
| Info.plist permissions | Pass | `tool/configure_platforms.py` adds camera, photo library, photo add, notification text, WhatsApp schemes, and background notification mode. | Permission strings are English only. Optional fix: localize iOS permission strings if the App Store listing targets Arabic/Kurdish users. |
| Camera permissions | Pass | `NSCameraUsageDescription` is generated and `ImageSource.camera` is used for product photos. | Needs real-device test because simulator camera behavior is limited. |
| Photo library permissions | Pass | `NSPhotoLibraryUsageDescription` and `NSPhotoLibraryAddUsageDescription` are generated and gallery picking uses `pickMultiImage`. | iOS 14+ limited-library mode should be tested on a device. |
| Image picker compatibility | Pass | `image_picker ^1.1.2`; CI completed `pod install` and iOS release build. | Product images are converted to base64 data URLs. This works cross-platform but can hit backend/body-size limits with 6 large photos. Keep compression or move to direct object storage if uploads become slow. |
| Supabase compatibility | Pass | The mobile app uses the website backend over HTTPS via `BOTLLY_API_BASE_URL`, not a direct Supabase iOS SDK. | No iOS Supabase client setup is required. Backend SSL and API availability must still be tested from a real iPhone network. |
| Push notifications compatibility | Partial | `flutter_local_notifications` initializes iOS notification permissions; entitlement file is generated. | This only proves local/permission compatibility. Real remote push needs Apple Developer push capability, production APNs entitlement/provisioning profile, device token registration in the app, and backend push sending. |
| URL launcher compatibility | Pass | `url_launcher ^6.3.1`; CI iOS build success. | Add fallback user message if `launchUrl` returns false on device. |
| WhatsApp links compatibility | Partial | `LSApplicationQueriesSchemes` includes `whatsapp` and `whatsapp-business`; HTTPS links launch externally. | Current code only launches store preview URL. If direct WhatsApp chat is required, add a helper using `whatsapp://send?phone=...` with `https://wa.me/...` fallback. |
| Flutter package iOS support | Pass | Dependencies resolve and CocoaPods install/build succeeds on macOS runner. | `flutter_local_notifications` is older than the latest major version. Not a blocker, but schedule a controlled upgrade later. |
| iOS deployment target | Pass | Podfile is set to iOS `13.0`. | iOS 13 is acceptable for App Store and broad device support. Raise only if future plugins require newer iOS. |
| App Store submission | Partial | Bundle id `tech.botlly.merchant` and App Store export options template exist. | Not yet App Store-ready until signed IPA/TestFlight pipeline, app icon/display name, screenshots, privacy policy, privacy labels, production APNs, and release versioning are configured. |

## High Priority Fixes Before App Store

1. Configure Apple signing.
   - Create App Store Connect app for bundle id `tech.botlly.merchant`.
   - Add certificate/provisioning profile or App Store Connect API signing in CI.
   - Produce a signed `.ipa`, not only unsigned `.app`.

2. Finish push notification production path if order/store notifications are required.
   - Enable Push Notifications for the Apple App ID.
   - Use production APNs through the provisioning profile.
   - Add device token registration and backend push delivery.

3. Add App Store assets and metadata.
   - Production app icon instead of generated Flutter icon.
   - Proper display name.
   - Screenshots for iPhone sizes.
   - Privacy policy URL and App Store privacy questionnaire.

4. Run real-device smoke tests.
   - Login/signup.
   - Product add/edit/delete.
   - Camera photo capture.
   - Gallery multi-select up to 6 images.
   - Store preview link.
   - WhatsApp direct link if added.

## Medium Priority Improvements

- Add a WhatsApp launch helper with native scheme plus HTTPS fallback.
- Add upload progress/error handling for large product image payloads.
- Replace deprecated `DropdownButtonFormField.value` usages with `initialValue`.
- Remove the no-op non-null assertion reported by analyzer.
- Consider committing generated iOS files only when native customization becomes complex; current CI generation is acceptable and keeps the repo smaller.

## Current Verdict

Ready for iOS compile verification: yes.  
Ready for TestFlight/App Store upload: not yet.  
Main blocker: Apple signing and App Store production setup, not Flutter code compilation.
