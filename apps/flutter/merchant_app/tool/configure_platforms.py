from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
IOS_BUNDLE_ID = "tech.botlly.merchant"


def patch_once(text: str, needle: str, insert: str) -> str:
    if insert in text:
        return text
    index = text.find(needle)
    if index == -1:
        raise SystemExit(f"Could not find marker: {needle}")
    return f"{text[:index]}{insert}{text[index:]}"


def configure_android() -> None:
    manifest_path = ROOT / "android/app/src/main/AndroidManifest.xml"
    build_gradle_path = ROOT / "android/app/build.gradle.kts"

    if manifest_path.exists():
        manifest = manifest_path.read_text(encoding="utf-8")
        permissions = [
            '<uses-permission android:name="android.permission.INTERNET" />',
            '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
            '<uses-permission android:name="android.permission.CAMERA" />',
            '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
            '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
            '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
        ]
        missing = [permission for permission in permissions if permission not in manifest]
        if missing:
            manifest = patch_once(
                manifest,
                "<application",
                f"{chr(10).join(missing)}{chr(10)}    ",
            )
            manifest_path.write_text(manifest, encoding="utf-8")

    if build_gradle_path.exists():
        build_gradle = build_gradle_path.read_text(encoding="utf-8")
        if "isCoreLibraryDesugaringEnabled = true" not in build_gradle:
            build_gradle = build_gradle.replace(
                "compileOptions {\n",
                "compileOptions {\n"
                "        isCoreLibraryDesugaringEnabled = true\n",
                1,
            )
        if "coreLibraryDesugaring(" not in build_gradle:
            build_gradle = (
                f"{build_gradle.rstrip()}\n\n"
                "dependencies {\n"
                '    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")\n'
                "}\n"
            )
        build_gradle_path.write_text(build_gradle, encoding="utf-8")


def plist_entry(key: str, value: str) -> str:
    return f"\t<key>{key}</key>\n\t<string>{value}</string>\n"


def configure_ios() -> None:
    info_plist_path = ROOT / "ios/Runner/Info.plist"
    if not info_plist_path.exists():
        return

    info = info_plist_path.read_text(encoding="utf-8")
    usage_entries = {
        "NSCameraUsageDescription": "Botlly uses the camera to add product photos.",
        "NSPhotoLibraryUsageDescription": "Botlly uses your photo library to select product photos.",
        "NSPhotoLibraryAddUsageDescription": "Botlly may save selected product photos when needed.",
        "NSUserNotificationsUsageDescription": "Botlly sends merchant order and store notifications.",
    }
    for key, value in usage_entries.items():
        if f"<key>{key}</key>" not in info:
            info = patch_once(info, "</dict>", plist_entry(key, value))

    if "<key>LSApplicationQueriesSchemes</key>" not in info:
        schemes = (
            "\t<key>LSApplicationQueriesSchemes</key>\n"
            "\t<array>\n"
            "\t\t<string>whatsapp</string>\n"
            "\t\t<string>whatsapp-business</string>\n"
            "\t\t<string>https</string>\n"
            "\t</array>\n"
        )
        info = patch_once(info, "</dict>", schemes)

    if "<key>UIBackgroundModes</key>" not in info:
        modes = (
            "\t<key>UIBackgroundModes</key>\n"
            "\t<array>\n"
            "\t\t<string>remote-notification</string>\n"
            "\t</array>\n"
        )
        info = patch_once(info, "</dict>", modes)

    info_plist_path.write_text(info, encoding="utf-8")

    entitlements_path = ROOT / "ios/Runner/Runner.entitlements"
    if not entitlements_path.exists():
        entitlements_path.write_text(
            """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>aps-environment</key>
\t<string>development</string>
</dict>
</plist>
""",
            encoding="utf-8",
        )

    project_path = ROOT / "ios/Runner.xcodeproj/project.pbxproj"
    if project_path.exists():
        project = project_path.read_text(encoding="utf-8")
        project = re.sub(
            r"PRODUCT_BUNDLE_IDENTIFIER = [^;]+;",
            f"PRODUCT_BUNDLE_IDENTIFIER = {IOS_BUNDLE_ID};",
            project,
        )
        if "CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;" not in project:
            project = project.replace(
                "PRODUCT_BUNDLE_IDENTIFIER = tech.botlly.merchant;",
                "CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;\n\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = tech.botlly.merchant;",
            )
        project_path.write_text(project, encoding="utf-8")

    podfile_path = ROOT / "ios/Podfile"
    if podfile_path.exists():
        podfile = podfile_path.read_text(encoding="utf-8")
        if "platform :ios" not in podfile:
            podfile = "platform :ios, '13.0'\n" + podfile
        else:
            podfile = podfile.replace("# platform :ios, '12.0'", "platform :ios, '13.0'")
            podfile = podfile.replace("platform :ios, '12.0'", "platform :ios, '13.0'")
            podfile = podfile.replace("platform :ios, '11.0'", "platform :ios, '13.0'")
        podfile_path.write_text(podfile, encoding="utf-8")


def main() -> None:
    configure_android()
    configure_ios()


if __name__ == "__main__":
    main()
