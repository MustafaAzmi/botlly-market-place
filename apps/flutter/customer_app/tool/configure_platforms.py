from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
ANDROID_PACKAGE = "tech.botlly.customer"
IOS_BUNDLE_ID = "tech.botlly.customer"
APP_DISPLAY_NAME = "Botlly Customer"


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

    if build_gradle_path.exists():
        build_gradle = build_gradle_path.read_text(encoding="utf-8")
        build_gradle = re.sub(
            r'namespace = "[^"]+"',
            f'namespace = "{ANDROID_PACKAGE}"',
            build_gradle,
        )
        build_gradle = re.sub(
            r'applicationId = "[^"]+"',
            f'applicationId = "{ANDROID_PACKAGE}"',
            build_gradle,
        )
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

    if manifest_path.exists():
        manifest = manifest_path.read_text(encoding="utf-8")
        permissions = [
            '<uses-permission android:name="android.permission.INTERNET" />',
            '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
            '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
        ]
        missing = [permission for permission in permissions if permission not in manifest]
        if missing:
            manifest = patch_once(
                manifest,
                "<application",
                f"{chr(10).join(missing)}{chr(10)}    ",
            )
        manifest = re.sub(
            r'android:label="[^"]+"',
            f'android:label="{APP_DISPLAY_NAME}"',
            manifest,
            count=1,
        )
        manifest_path.write_text(manifest, encoding="utf-8")

    src_root = ROOT / "android/app/src/main/kotlin"
    if src_root.exists():
        activity_files = list(src_root.rglob("MainActivity.kt"))
        if activity_files:
            activity = activity_files[0]
            lines = activity.read_text(encoding="utf-8").splitlines()
            if lines and lines[0].startswith("package "):
                lines[0] = f"package {ANDROID_PACKAGE}"
            else:
                lines.insert(0, f"package {ANDROID_PACKAGE}")
            target = src_root.joinpath(*ANDROID_PACKAGE.split("."), "MainActivity.kt")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("\n".join(lines) + "\n", encoding="utf-8")
            if activity.resolve() != target.resolve():
                activity.unlink()


def plist_string(key: str, value: str) -> str:
    return f"\t<key>{key}</key>\n\t<string>{value}</string>\n"


def configure_ios() -> None:
    info_plist_path = ROOT / "ios/Runner/Info.plist"
    if info_plist_path.exists():
        info = info_plist_path.read_text(encoding="utf-8")
        if "<key>CFBundleDisplayName</key>" not in info:
            info = patch_once(info, "</dict>", plist_string("CFBundleDisplayName", APP_DISPLAY_NAME))
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
        info_plist_path.write_text(info, encoding="utf-8")

    project_path = ROOT / "ios/Runner.xcodeproj/project.pbxproj"
    if project_path.exists():
        project = project_path.read_text(encoding="utf-8")
        project = re.sub(
            r"PRODUCT_BUNDLE_IDENTIFIER = [^;]+;",
            f"PRODUCT_BUNDLE_IDENTIFIER = {IOS_BUNDLE_ID};",
            project,
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
