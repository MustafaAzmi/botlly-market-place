import 'dart:ui' as ui;

const apiBaseUrl = String.fromEnvironment(
  'BOTLLY_API_BASE_URL',
  defaultValue: 'https://bot-lly.tech',
);

const apiFallbackBaseUrls = <String>[
  'https://www.bot-lly.tech',
  'https://bot-lly.tech',
];

const iraqiGovernorates = <String>[
  'بغداد',
  'نينوى',
  'البصرة',
  'أربيل',
  'السليمانية',
  'دهوك',
  'كركوك',
  'الأنبار',
  'صلاح الدين',
  'ديالى',
  'واسط',
  'بابل',
  'كربلاء',
  'النجف',
  'الديوانية',
  'المثنى',
  'ذي قار',
  'ميسان',
  'حلبجة',
];

enum AppLanguage {
  ar('ar', 'العربية', ui.TextDirection.rtl, 'ar'),
  en('en', 'English', ui.TextDirection.ltr, 'en'),
  ckb('ckb', 'کوردی', ui.TextDirection.rtl, 'ar');

  const AppLanguage(this.code, this.label, this.direction, this.numberLocale);

  final String code;
  final String label;
  final ui.TextDirection direction;
  final String numberLocale;

  static AppLanguage parse(String? value) => AppLanguage.values.firstWhere(
        (language) => language.code == value,
        orElse: () => AppLanguage.ar,
      );
}
