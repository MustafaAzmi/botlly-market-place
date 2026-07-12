import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  unawaited(NotificationService.instance.initialize());
  runApp(const BotlyMerchantApp());
}

const governorates = <String>[
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

const apiBaseUrl = String.fromEnvironment(
  'BOTLLY_API_BASE_URL',
  defaultValue: 'https://bot-lly.tech',
);
const placeholderImage =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const maxProductImages = 6;
const _unset = Object();

class NotificationService {
  NotificationService._();

  static final instance = NotificationService._();
  final _plugin = FlutterLocalNotificationsPlugin();
  var _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    await _plugin.initialize(
      const InitializationSettings(android: android, iOS: ios),
    );
    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
    _initialized = true;
  }

  Future<void> show({
    required String title,
    required String body,
    int id = 2001,
  }) async {
    await initialize();
    const android = AndroidNotificationDetails(
      'botlly_merchant_order_updates',
      'Botlly merchant order updates',
      channelDescription: 'Order updates for Botlly merchant inbox.',
      importance: Importance.high,
      priority: Priority.high,
      playSound: true,
      enableVibration: true,
    );
    const ios = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );
    await _plugin.show(
      id,
      title,
      body,
      const NotificationDetails(android: android, iOS: ios),
    );
  }
}

enum AppLanguage {
  ar('ar', 'العربية', ui.TextDirection.rtl, 'ar'),
  en('en', 'English', ui.TextDirection.ltr, 'en'),
  ckb('ckb', 'کوردی', ui.TextDirection.rtl, 'ar');

  const AppLanguage(this.code, this.label, this.direction, this.numberLocale);

  final String code;
  final String label;
  final ui.TextDirection direction;
  final String numberLocale;

  static AppLanguage parse(String? value) {
    return AppLanguage.values.firstWhere(
      (language) => language.code == value,
      orElse: () => AppLanguage.ar,
    );
  }
}

NumberFormat numberFormatFor(BuildContext context) {
  return NumberFormat.decimalPattern(LocaleScope.languageOf(context).numberLocale);
}

class LocaleScope extends InheritedWidget {
  const LocaleScope({
    required this.language,
    required this.onChanged,
    required super.child,
    super.key,
  });

  final AppLanguage language;
  final ValueChanged<AppLanguage> onChanged;

  static AppLanguage languageOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<LocaleScope>()?.language ?? AppLanguage.ar;
  }

  static AppText textOf(BuildContext context) => AppText(languageOf(context));

  static void setLanguage(BuildContext context, AppLanguage language) {
    context.dependOnInheritedWidgetOfExactType<LocaleScope>()?.onChanged(language);
  }

  @override
  bool updateShouldNotify(LocaleScope oldWidget) => language != oldWidget.language;
}

class AppText {
  const AppText(this.language);

  final AppLanguage language;

  String pick(String ar, String en, String ckb) => switch (language) {
        AppLanguage.ar => ar,
        AppLanguage.en => en,
        AppLanguage.ckb => ckb,
      };

  String get appTitle => pick('بوتلي تاجر', 'Botlly Merchant', 'بۆتلی فرۆشیار');
  String get appSubtitle => pick('إدارة المتجر والطلبات', 'Store and order management', 'بەڕێوەبردنی دوکان و داواکارییەکان');
  String get resetPassword => pick('استعادة كلمة المرور', 'Reset password', 'گەڕاندنەوەی وشەی نهێنی');
  String get merchantLogin => pick('دخول التاجر', 'Merchant login', 'چوونەژوورەوەی فرۆشیار');
  String get resetHint => pick('اختر رقم الواتساب أو الإيميل لإرسال كود إعادة التعيين.', 'Use WhatsApp or email to request a reset code.', 'واتساپ یان ئیمەیڵ بەکاربهێنە بۆ کۆدی گەڕاندنەوە.');
  String get authHint => pick('سجل دخولك أو أنشئ متجر جديد لإدارة المنتجات والطلبات.', 'Sign in or create a store to manage products and orders.', 'بچۆ ژوورەوە یان دوکانێکی نوێ دروست بکە بۆ بەڕێوەبردنی کاڵا و داواکاری.');
  String get whatsapp => pick('رقم الواتساب', 'WhatsApp number', 'ژمارەی واتساپ');
  String get optionalEmail => pick('الإيميل اختياري', 'Email optional', 'ئیمەیڵ ئارەزوومەندانەیە');
  String get sendResetCode => pick('إرسال كود التعيين', 'Send reset code', 'ناردنی کۆدی گەڕاندنەوە');
  String get resetPrepared => pick('تم تجهيز طلب إعادة التعيين. سيتم ربطه بقالب واتساب/إيميل بالخطوة القادمة.', 'Reset request prepared. WhatsApp/email delivery will be connected next.', 'داواکاری گەڕاندنەوە ئامادەیە. ناردنی واتساپ/ئیمەیڵ دواتر دەبەسترێتەوە.');
  String get back => pick('رجوع', 'Back', 'گەڕانەوە');
  String get login => pick('دخول', 'Login', 'چوونەژوورەوە');
  String get signup => pick('إنشاء', 'Create', 'دروستکردن');
  String get storeName => pick('اسم المحل أو الشركة', 'Store or company name', 'ناوی دوکان یان کۆمپانیا');
  String get governorate => pick('المحافظة', 'Governorate', 'پارێزگا');
  String get password => pick('كلمة المرور', 'Password', 'وشەی نهێنی');
  String get forgotPassword => pick('نسيت كلمة المرور؟', 'Forgot password?', 'وشەی نهێنیت لەبیرچووە؟');
  String get enterDashboard => pick('دخول إلى اللوحة', 'Open dashboard', 'کردنەوەی داشبۆرد');
  String get createAccount => pick('إنشاء الحساب', 'Create account', 'دروستکردنی هەژمار');
  String get home => pick('الرئيسية', 'Home', 'سەرەکی');
  String get products => pick('المنتجات', 'Products', 'کاڵاکان');
  String get orders => pick('الطلبات', 'Orders', 'داواکارییەکان');
  String get store => pick('المتجر', 'Store', 'دوکان');
  String greeting(String name) => pick('هلا $name', 'Hi $name', 'سڵاو $name');
  String get dashboardSubtitle => pick('تابع أداء متجرك والمنتجات التي تظهر للزبائن.', 'Track store performance and products shown to customers.', 'چاودێری کارایی دوکان و کاڵاکانی پیشاندراو بە کڕیاران بکە.');
  String get signOut => pick('خروج', 'Sign out', 'چوونەدەرەوە');
  String get search => pick('بحث', 'Search', 'گەڕان');
  String get completion => pick('اكتمال الصفحة', 'Page completion', 'تەواوبوونی پەڕە');
  String get latestProducts => pick('آخر المنتجات', 'Latest products', 'دوایین کاڵاکان');
  String get noProductsYet => pick('لا توجد منتجات بعد. أضف أول منتج حتى يظهر للزبائن.', 'No products yet. Add the first product so customers can see it.', 'هێشتا هیچ کاڵایەک نییە. یەکەم کاڵا زیاد بکە تا بۆ کڕیاران دەربکەوێت.');
  String get profileCompletion => pick('اكتمال صفحة المتجر', 'Store page completion', 'تەواوبوونی پەڕەی دوکان');
  String get profileCompletionHint => pick('أكمل اللوكو، الغلاف، البايو، رقم التوصيل، وأول منتج.', 'Complete logo, cover, bio, delivery phone, and first product.', 'لۆگۆ، کاڤەر، بایۆ، ژمارەی گەیاندن و یەکەم کاڵا تەواو بکە.');
  String get productsSubtitle => pick('أضف وعدل القطع التي يبحث عنها الزبائن في بوتلي.', 'Add and edit the parts customers search for in Botlly.', 'ئەو پارچانە زیاد و دەستکاری بکە کڕیاران لە بۆتلی دەیانگەڕێن.');
  String get addProduct => pick('إضافة منتج', 'Add product', 'زیادکردنی کاڵا');
  String get editProduct => pick('تعديل منتج', 'Edit product', 'دەستکاریکردنی کاڵا');
  String get noMatchingProducts => pick('لا توجد منتجات مطابقة. أضف منتج جديد حتى يقدر البوت يرشحه للزبائن.', 'No matching products. Add a product so the bot can recommend it.', 'کاڵای هاوتا نییە. کاڵایەکی نوێ زیاد بکە تا بۆتەک پێشنیازی بکات.');
  String get productDeleted => pick('تم حذف المنتج', 'Product deleted', 'کاڵاکە سڕایەوە');
  String get ordersSubtitle => pick('الطلبات التي أنشأها بوت واتساب لهذا المتجر.', 'Orders created by the WhatsApp bot for this store.', 'ئەو داواکارییانەی بۆتی واتساپ بۆ ئەم دوکانە دروستی کردووە.');
  String get noOrders => pick('لا توجد طلبات بعد.', 'No orders yet.', 'هێشتا داواکاری نییە.');
  String get confirmed => pick('مؤكد', 'Confirmed', 'پشتڕاستکراو');
  String get sentToDelivery => pick('تم إرسال الطلب للتوصيل', 'Sent to delivery', 'داواکاری بۆ گەیاندن نێردرا');
  String get storePage => pick('صفحة التاجر', 'Merchant page', 'پەڕەی فرۆشیار');
  String get storeSubtitle => pick('بيانات المتجر التي تظهر للزبائن وتستخدم بالبحث القريب.', 'Store details shown to customers and used for nearby search.', 'زانیاری دوکان کە بۆ کڕیاران دەردەکەوێت و بۆ گەڕانی نزیک بەکاردێت.');
  String get preview => pick('معاينة', 'Preview', 'پێشبینین');
  String get storeImages => pick('صور المتجر', 'Store images', 'وێنەکانی دوکان');
  String get storeImagesHint => pick('رفع اللوكو والغلاف سيتم ربطه مع اختيار الصور بالخطوة القادمة.', 'Logo and cover upload will be connected in the next step.', 'بارکردنی لۆگۆ و کاڤەر لە هەنگاوی داهاتوو دەبەسترێتەوە.');
  String get merchantWhatsapp => pick('رقم واتساب التاجر', 'Merchant WhatsApp', 'واتساپی فرۆشیار');
  String get storeBio => pick('بايو المحل', 'Store bio', 'بایۆی دوکان');
  String get storeAddress => pick('عنوان المتجر أو رابط الموقع', 'Store address or map link', 'ناونیشانی دوکان یان لینکی شوێن');
  String get deliveryPhone => pick('رقم التوصيل', 'Delivery phone', 'ژمارەی گەیاندن');
  String get storeSaved => pick('تم حفظ صفحة المتجر', 'Store page saved', 'پەڕەی دوکان پاشەکەوت کرا');
  String get saveContinue => pick('حفظ والمتابعة', 'Save and continue', 'پاشەکەوت و بەردەوامبوون');
  String productPhotos(int count) => pick('صور المنتج ($count/$maxProductImages)', 'Product photos ($count/$maxProductImages)', 'وێنەکانی کاڵا ($count/$maxProductImages)');
  String get camera => pick('الكاميرا', 'Camera', 'کامێرا');
  String get gallery => pick('الاستوديو', 'Gallery', 'گەلەری');
  String get primary => pick('الرئيسية', 'Primary', 'سەرەکی');
  String get photoHint => pick('أضف صورة واحدة على الأقل، وبحد أقصى 6 صور لكل منتج.', 'Add at least one photo, up to 6 per product.', 'لانیکەم وێنەیەک زیاد بکە، تا ٦ وێنە بۆ هەر کاڵایەک.');
  String get productName => pick('اسم المنتج', 'Product name', 'ناوی کاڵا');
  String get description => pick('الوصف', 'Description', 'وەسف');
  String get currentPrice => pick('السعر الحالي', 'Current price', 'نرخی ئێستا');
  String get finalPrice => pick('السعر النهائي', 'Final price', 'نرخی کۆتایی');
  String get currency => pick('العملة', 'Currency', 'دراو');
  String currencyName(String code) => switch (code) {
        'USD' => pick('دولار', 'Dollar', 'دۆلار'),
        'IQD' => pick('دينار عراقي', 'Iraqi dinar', 'دیناری عێراقی'),
        _ => code,
      };
  String get quantity => pick('الكمية', 'Quantity', 'بڕ');
  String get color => pick('اللون', 'Color', 'ڕەنگ');
  String get size => pick('الحجم/المقاس', 'Size', 'قەبارە');
  String get carMake => pick('نوع السيارة', 'Car make', 'جۆری ئۆتۆمبێل');
  String get carModel => pick('الموديل', 'Model', 'مۆدێل');
  String get carYear => pick('سنة الصنع', 'Manufacture year', 'ساڵی دروستکردن');
  String get allYears => pick('كل السنوات', 'All years', 'هەموو ساڵەکان');
  String get photoRequired => pick('أضف صورة واحدة على الأقل للمنتج.', 'Add at least one product photo.', 'لانیکەم وێنەیەک بۆ کاڵاکە زیاد بکە.');
  String get productRequired => pick('اسم المنتج والوصف والسعر مطلوبة.', 'Product name, description, and price are required.', 'ناو، وەسف و نرخ پێویستن.');
  String get productSaved => pick('تم حفظ المنتج', 'Product saved', 'کاڵاکە پاشەکەوت کرا');
  String get saveProduct => pick('حفظ المنتج', 'Save product', 'پاشەکەوتکردنی کاڵا');
  String get sessionExpired => pick('انتهت الجلسة. سجل دخول مرة ثانية.', 'Session expired. Sign in again.', 'دانیشتنەکە تەواو بوو. دووبارە بچۆ ژوورەوە.');
  String get missingLoginFields => pick('رقم الواتساب وكلمة المرور مطلوبة.', 'WhatsApp and password are required.', 'واتساپ و وشەی نهێنی پێویستن.');
  String get missingSignupFields => pick('اسم المحل ورقم الواتساب والمحافظة وكلمة المرور مطلوبة.', 'Store name, WhatsApp, governorate, and password are required.', 'ناوی دوکان، واتساپ، پارێزگا و وشەی نهێنی پێویستن.');
  String get badResponse => pick('استجابة غير مفهومة من الخادم.', 'Unexpected server response.', 'وەڵامی سێرڤەر ڕوون نییە.');
  String get backendError => pick('تعذر الاتصال بالباكند.', 'Could not contact backend.', 'پەیوەندی بە باکێندەوە نەکرا.');
}

class BotlyMerchantApp extends StatefulWidget {
  const BotlyMerchantApp({super.key});

  @override
  State<BotlyMerchantApp> createState() => _BotlyMerchantAppState();
}

class _BotlyMerchantAppState extends State<BotlyMerchantApp> {
  final repository = MerchantRepository();
  var language = AppLanguage.ar;

  @override
  void initState() {
    super.initState();
    unawaited(_restoreLanguage());
  }

  Future<void> _restoreLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() => language = AppLanguage.parse(prefs.getString('app_language')));
  }

  Future<void> _setLanguage(AppLanguage next) async {
    if (next == language) return;
    setState(() => language = next);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('app_language', next.code);
  }

  @override
  void dispose() {
    repository.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MerchantScope(
      repository: repository,
      child: LocaleScope(
        language: language,
        onChanged: (next) => unawaited(_setLanguage(next)),
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          title: AppText(language).appTitle,
          locale: Locale(language.code),
          theme: ThemeData(
            useMaterial3: true,
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xff22c55e),
              brightness: Brightness.light,
            ),
            scaffoldBackgroundColor: const Color(0xfff7faf7),
            fontFamily: 'Roboto',
            inputDecorationTheme: InputDecorationTheme(
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xffdfe7df)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xffdfe7df)),
              ),
            ),
            cardTheme: CardThemeData(
              elevation: 0,
              color: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
                side: const BorderSide(color: Color(0xffe3e9e3)),
              ),
            ),
          ),
          builder: (context, child) {
            return Directionality(
              textDirection: language.direction,
              child: child ?? const SizedBox.shrink(),
            );
          },
          home: const SplashGate(),
        ),
      ),
    );
  }
}

class MerchantScope extends InheritedWidget {
  const MerchantScope({
    required this.repository,
    required super.child,
    super.key,
  });

  final MerchantRepository repository;

  static MerchantRepository of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<MerchantScope>();
    assert(scope != null, 'MerchantScope is missing');
    return scope!.repository;
  }

  @override
  bool updateShouldNotify(MerchantScope oldWidget) => repository != oldWidget.repository;
}

class MerchantProfile {
  const MerchantProfile({
    required this.id,
    required this.storeName,
    required this.whatsapp,
    required this.city,
    this.storeSlug,
    this.email,
    this.bio,
    this.address,
    this.deliveryPhone,
    this.logoUrl,
    this.coverUrl,
  });

  final String id;
  final String storeName;
  final String whatsapp;
  final String city;
  final String? storeSlug;
  final String? email;
  final String? bio;
  final String? address;
  final String? deliveryPhone;
  final String? logoUrl;
  final String? coverUrl;

  factory MerchantProfile.fromJson(Map<String, dynamic> json) {
    return MerchantProfile(
      id: _string(json['id'], fallback: 'merchant'),
      storeName: _string(json['storeName'], fallback: 'متجر'),
      whatsapp: _string(json['whatsapp']),
      city: _string(json['city'], fallback: 'بغداد'),
      storeSlug: _optionalString(json['storeSlug']),
      email: _optionalString(json['email']),
      bio: _optionalString(json['bio']),
      address: _optionalString(json['address']),
      deliveryPhone: _optionalString(json['deliveryPhone']),
      logoUrl: _optionalString(json['logoUrl']),
      coverUrl: _optionalString(json['coverUrl']),
    );
  }

  MerchantProfile copyWith({
    String? storeName,
    String? whatsapp,
    String? city,
    String? bio,
    String? address,
    String? deliveryPhone,
  }) {
    return MerchantProfile(
      id: id,
      storeName: storeName ?? this.storeName,
      whatsapp: whatsapp ?? this.whatsapp,
      city: city ?? this.city,
      storeSlug: storeSlug,
      email: email,
      bio: bio ?? this.bio,
      address: address ?? this.address,
      deliveryPhone: deliveryPhone ?? this.deliveryPhone,
      logoUrl: logoUrl,
      coverUrl: coverUrl,
    );
  }
}

class MerchantProduct {
  const MerchantProduct({
    required this.id,
    required this.title,
    required this.description,
    required this.currentPrice,
    required this.currency,
    required this.createdAt,
    this.imageUrl = '',
    this.imageUrls = const [],
    this.discountPrice,
    this.quantity,
    this.color,
    this.size,
    this.carMake,
    this.carModel,
    this.carYear,
  });

  final String id;
  final String title;
  final String description;
  final String imageUrl;
  final List<String> imageUrls;
  final double currentPrice;
  final double? discountPrice;
  final String currency;
  final int? quantity;
  final String? color;
  final String? size;
  final String? carMake;
  final String? carModel;
  final String? carYear;
  final DateTime createdAt;

  double get customerPrice => discountPrice ?? currentPrice;

  factory MerchantProduct.fromJson(Map<String, dynamic> json) {
    return MerchantProduct(
      id: _string(json['id'], fallback: 'product'),
      title: _string(json['title'], fallback: 'منتج'),
      description: _string(json['description']),
      imageUrl: _string(json['imageUrl']),
      imageUrls: _list(json['imageUrls']).whereType<String>().toList(),
      currentPrice: _double(json['currentPrice']),
      discountPrice: _nullableDouble(json['discountPrice']),
      currency: _string(json['currency'], fallback: 'IQD'),
      quantity: _nullableInt(json['quantity']),
      color: _optionalString(json['color']),
      size: _optionalString(json['size']),
      carMake: _optionalString(json['carMake']),
      carModel: _optionalString(json['carModel']),
      carYear: _optionalString(json['carYear']),
      createdAt: DateTime.tryParse(_string(json['createdAt'])) ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toApiPayload(String token, {String? productId}) {
    final images = imageUrls.isNotEmpty
        ? imageUrls
        : imageUrl.isNotEmpty
            ? [imageUrl]
            : [placeholderImage];
    return _withoutNull({
      'token': token,
      if (productId != null) 'productId': productId,
      'title': title,
      'description': description,
      'imageUrl': images.first,
      'imageUrls': images.take(maxProductImages).toList(),
      'currentPrice': currentPrice,
      if (discountPrice != null) 'discountPrice': discountPrice,
      'currency': currency,
      if (quantity != null) 'quantity': quantity,
      'color': color,
      'size': size,
      'carMake': carMake,
      'carModel': carModel,
      'carYear': carYear,
    });
  }

  MerchantProduct copyWith({
    String? title,
    String? description,
    String? imageUrl,
    List<String>? imageUrls,
    double? currentPrice,
    Object? discountPrice = _unset,
    String? currency,
    Object? quantity = _unset,
    Object? color = _unset,
    Object? size = _unset,
    Object? carMake = _unset,
    Object? carModel = _unset,
    Object? carYear = _unset,
  }) {
    return MerchantProduct(
      id: id,
      title: title ?? this.title,
      description: description ?? this.description,
      imageUrl: imageUrl ?? this.imageUrl,
      imageUrls: imageUrls ?? this.imageUrls,
      currentPrice: currentPrice ?? this.currentPrice,
      discountPrice: identical(discountPrice, _unset) ? this.discountPrice : discountPrice as double?,
      currency: currency ?? this.currency,
      quantity: identical(quantity, _unset) ? this.quantity : quantity as int?,
      color: identical(color, _unset) ? this.color : color as String?,
      size: identical(size, _unset) ? this.size : size as String?,
      carMake: identical(carMake, _unset) ? this.carMake : carMake as String?,
      carModel: identical(carModel, _unset) ? this.carModel : carModel as String?,
      carYear: identical(carYear, _unset) ? this.carYear : carYear as String?,
      createdAt: createdAt,
    );
  }
}

class MerchantOrder {
  const MerchantOrder({
    required this.id,
    required this.productTitle,
    required this.productPrice,
    required this.currency,
    required this.customerNumber,
    required this.customerDetails,
    required this.status,
    required this.merchantStatus,
    required this.requesterStatus,
    required this.finalStatus,
    required this.merchantNote,
    required this.sentToDelivery,
    required this.createdAt,
  });

  final String id;
  final String productTitle;
  final double productPrice;
  final String currency;
  final String customerNumber;
  final String customerDetails;
  final String status;
  final String merchantStatus;
  final String requesterStatus;
  final String finalStatus;
  final String merchantNote;
  final bool sentToDelivery;
  final DateTime createdAt;

  bool get canMarkAvailability => merchantStatus == 'Pending';
  bool get canConfirmSale => merchantStatus == 'Available';

  factory MerchantOrder.fromJson(Map<String, dynamic> json) {
    return MerchantOrder(
      id: _string(json['id'], fallback: 'order'),
      productTitle: _string(json['productTitle'], fallback: 'منتج'),
      productPrice: _double(json['productPrice']),
      currency: _string(json['currency'], fallback: 'IQD'),
      customerNumber: _string(json['customerNumber']),
      customerDetails: _string(json['customerDetails']),
      status: _string(json['status'], fallback: 'unknown'),
      merchantStatus: _string(json['merchantStatus'], fallback: 'Pending'),
      requesterStatus: _string(json['requesterStatus'], fallback: 'Pending'),
      finalStatus: _string(json['finalStatus'], fallback: _string(json['status'], fallback: 'pending_review')),
      merchantNote: _string(json['merchantNote']),
      sentToDelivery: json['sentToDelivery'] == true,
      createdAt: DateTime.tryParse(_string(json['createdAt'])) ?? DateTime.now(),
    );
  }
}

class MerchantDashboard {
  const MerchantDashboard({
    required this.profile,
    required this.products,
    required this.orders,
  });

  final MerchantProfile profile;
  final List<MerchantProduct> products;
  final List<MerchantOrder> orders;

  int get completion {
    var score = 35;
    if ((profile.logoUrl ?? '').isNotEmpty) score += 15;
    if ((profile.coverUrl ?? '').isNotEmpty) score += 15;
    if ((profile.bio ?? '').isNotEmpty) score += 10;
    if ((profile.deliveryPhone ?? '').isNotEmpty) score += 10;
    if (products.isNotEmpty) score += 15;
    return min(score, 100);
  }
}

class CarMakeOption {
  const CarMakeOption({
    required this.key,
    required this.label,
    required this.models,
  });

  final String key;
  final String label;
  final List<String> models;

  factory CarMakeOption.fromJson(Map<String, dynamic> json) {
    return CarMakeOption(
      key: _string(json['key']),
      label: _string(json['label']),
      models: _list(json['models']).whereType<String>().toList(),
    );
  }
}

class MerchantCatalogue {
  const MerchantCatalogue({
    required this.makes,
    required this.colors,
    required this.years,
  });

  final List<CarMakeOption> makes;
  final List<String> colors;
  final List<String> years;

  factory MerchantCatalogue.fromJson(Map<String, dynamic> json) {
    return MerchantCatalogue(
      makes: _list(json['makes']).map((item) => CarMakeOption.fromJson(_map(item))).toList(),
      colors: _list(json['colors']).whereType<String>().toList(),
      years: _list(json['years']).whereType<String>().toList(),
    );
  }

  static const empty = MerchantCatalogue(makes: [], colors: [], years: []);
}

String _string(Object? value, {String fallback = ''}) {
  return value is String && value.isNotEmpty ? value : fallback;
}

String? _optionalString(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

double _double(Object? value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? 0;
  return 0;
}

double? _nullableDouble(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  if (value is String && value.trim().isNotEmpty) return double.tryParse(value);
  return null;
}

int? _nullableInt(Object? value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String && value.trim().isNotEmpty) return int.tryParse(value);
  return null;
}

Map<String, dynamic> _withoutEmpty(Map<String, dynamic> input) {
  final output = <String, dynamic>{};
  for (final entry in input.entries) {
    final value = entry.value;
    if (value == null) continue;
    if (value is String && value.trim().isEmpty) continue;
    output[entry.key] = value;
  }
  return output;
}

Map<String, dynamic> _withoutNull(Map<String, dynamic> input) {
  final output = <String, dynamic>{};
  for (final entry in input.entries) {
    if (entry.value != null) output[entry.key] = entry.value;
  }
  return output;
}

class MerchantRepository extends ChangeNotifier {
  static const _orderPollInterval = Duration(seconds: 30);

  MerchantProfile? _profile;
  String? _token;
  final _products = <MerchantProduct>[];
  final _orders = <MerchantOrder>[];
  MerchantCatalogue? _catalogue;
  bool _productsLoaded = false;
  bool _ordersLoaded = false;
  Timer? _ordersTimer;
  var _ordersSnapshotReady = false;
  var _suppressNextOrderNotification = false;
  final _orderSignatures = <String, String>{};

  MerchantProfile? get profile => _profile;
  String? get token => _token;
  bool get isSignedIn => _token != null && _profile != null;

  Future<void> restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final savedToken = prefs.getString('merchant_token');
    final savedName = prefs.getString('merchant_store_name');
    final savedPhone = prefs.getString('merchant_whatsapp');
    if (savedToken == null || savedName == null || savedPhone == null) return;
    _token = savedToken;
    _profile = MerchantProfile(
      id: prefs.getString('merchant_id') ?? 'local-merchant',
      storeName: savedName,
      whatsapp: savedPhone,
      city: prefs.getString('merchant_city') ?? 'بغداد',
      storeSlug: prefs.getString('merchant_slug') ?? 'local-store',
      bio: prefs.getString('merchant_bio'),
      address: prefs.getString('merchant_address'),
      deliveryPhone: prefs.getString('merchant_delivery_phone'),
    );
    startOrderUpdates();
  }

  Future<MerchantProfile> login({
    required String whatsapp,
    required String password,
  }) async {
    if (whatsapp.trim().length < 3 || password.length < 6) {
      throw StateError('رقم الواتساب وكلمة المرور مطلوبة.');
    }
    final result = _map(await _post('login', {
      'whatsapp': whatsapp.trim(),
      'password': password,
    }));
    _token = _string(result['token']);
    _profile = MerchantProfile.fromJson(_map(result['profile']));
    await _persistProfile();
    startOrderUpdates();
    notifyListeners();
    return _profile!;
  }

  Future<MerchantProfile> signup({
    required String storeName,
    required String whatsapp,
    required String password,
    required String city,
    required String otpCode,
    List<String> carMakes = const [],
    List<String> carModels = const [],
    List<String> specialties = const [],
  }) async {
    if (storeName.trim().isEmpty || whatsapp.trim().isEmpty || password.length < 6 || city.isEmpty || otpCode.trim().isEmpty) {
      throw StateError('اسم المحل ورقم الواتساب والمحافظة وكلمة المرور مطلوبة.');
    }
    final result = _map(await _post('signup', _withoutEmpty({
      'storeName': storeName.trim(),
      'whatsapp': whatsapp.trim(),
      'password': password,
      'city': city,
      'otpCode': otpCode.trim(),
      'carMakes': carMakes,
      'carModels': carModels,
      'specialties': specialties,
    })));
    _token = _string(result['token']);
    _profile = MerchantProfile.fromJson(_map(result['profile']));
    await _persistProfile();
    startOrderUpdates();
    notifyListeners();
    return _profile!;
  }

  Future<void> requestOtp({required String whatsapp, required String purpose}) async {
    if (whatsapp.trim().isEmpty) throw StateError('أدخل رقم الواتساب أولاً.');
    await _post('requestOtp', {
      'whatsapp': whatsapp.trim(),
      'purpose': purpose,
    });
  }

  Future<MerchantCatalogue> getSignupCatalogue() async {
    final result = _map(await _post('signupCatalogue', const {}));
    return MerchantCatalogue.fromJson(result);
  }

  Future<MerchantProfile> resetPassword({
    required String whatsapp,
    required String password,
    required String otpCode,
  }) async {
    final result = _map(await _post('resetPassword', {
      'whatsapp': whatsapp.trim(),
      'password': password,
      'otpCode': otpCode.trim(),
    }));
    _token = _string(result['token']);
    _profile = MerchantProfile.fromJson(_map(result['profile']));
    await _persistProfile();
    notifyListeners();
    return _profile!;
  }

  Future<void> signOut() async {
    _ordersTimer?.cancel();
    _ordersTimer = null;
    _ordersSnapshotReady = false;
    _suppressNextOrderNotification = false;
    _orderSignatures.clear();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('merchant_token');
    _token = null;
    _profile = null;
    _productsLoaded = false;
    _ordersLoaded = false;
    _products.clear();
    _orders.clear();
    _catalogue = null;
    notifyListeners();
  }

  void startOrderUpdates() {
    if (!isSignedIn) return;
    _ordersTimer?.cancel();
    _ordersTimer = Timer.periodic(_orderPollInterval, (_) {
      unawaited(_refreshOrdersInBackground());
    });
  }

  Future<void> _refreshOrdersInBackground() async {
    if (!isSignedIn) return;
    try {
      await listOrders(force: true);
    } catch (_) {
      // Background refresh is best-effort; the visible screen keeps its current state.
    }
  }

  Future<MerchantDashboard> getDashboard() async {
    _requireSession();
    final dashboard = _map(await _post('dashboard', {'token': _token}));
    final orderRows = await _postList('listOrders', {'token': _token});
    _profile = MerchantProfile.fromJson(_map(dashboard['profile']));
    _products
      ..clear()
      ..addAll(_list(dashboard['products']).map((item) => MerchantProduct.fromJson(_map(item))));
    _orders
      ..clear()
      ..addAll(orderRows.map((item) => MerchantOrder.fromJson(_map(item))));
    _productsLoaded = true;
    _ordersLoaded = true;
    return MerchantDashboard(
      profile: _profile!,
      products: List.unmodifiable(_products),
      orders: List.unmodifiable(_orders),
    );
  }

  Future<List<MerchantProduct>> listProducts({bool force = false}) async {
    _requireSession();
    if (!force && _productsLoaded) return List.unmodifiable(_products);
    final rows = await _postList('listProducts', {'token': _token});
    _products
      ..clear()
      ..addAll(rows.map((item) => MerchantProduct.fromJson(_map(item))));
    _productsLoaded = true;
    return List.unmodifiable(_products);
  }

  Future<List<MerchantOrder>> listOrders({bool force = false}) async {
    _requireSession();
    if (!force && _ordersLoaded) return List.unmodifiable(_orders);
    final rows = await _postList('listOrders', {'token': _token});
    final nextOrders = rows.map((item) => MerchantOrder.fromJson(_map(item))).toList();
    if (_suppressNextOrderNotification) {
      _suppressNextOrderNotification = false;
      _rememberOrderSnapshot(nextOrders);
    } else {
      _notifyChangedOrders(nextOrders);
    }
    _orders
      ..clear()
      ..addAll(nextOrders);
    _ordersLoaded = true;
    notifyListeners();
    return List.unmodifiable(_orders);
  }

  Future<void> markOrderAvailable(
    String orderId, {
    double? finalPrice,
    String currency = 'IQD',
    String merchantNote = '',
  }) async {
    _requireSession();
    await _post('markAvailable', {
      'token': _token,
      'orderId': orderId,
      if (finalPrice != null) 'finalPrice': finalPrice,
      'currency': currency,
      'merchantNote': merchantNote,
    });
    _suppressNextOrderNotification = true;
    _ordersLoaded = false;
    notifyListeners();
  }

  Future<void> markOrderUnavailable(String orderId) async {
    _requireSession();
    await _post('markUnavailable', {'token': _token, 'orderId': orderId});
    _suppressNextOrderNotification = true;
    _ordersLoaded = false;
    notifyListeners();
  }

  Future<void> markOrderSold(String orderId) async {
    _requireSession();
    await _post('markSold', {'token': _token, 'orderId': orderId});
    _suppressNextOrderNotification = true;
    _ordersLoaded = false;
    notifyListeners();
  }

  Future<void> markOrderCancelled(String orderId) async {
    _requireSession();
    await _post('markCancelled', {'token': _token, 'orderId': orderId});
    _suppressNextOrderNotification = true;
    _ordersLoaded = false;
    notifyListeners();
  }

  Future<MerchantCatalogue> getCatalogue({bool force = false}) async {
    _requireSession();
    if (!force && _catalogue != null) return _catalogue!;
    final result = _map(await _post('catalogue', {'token': _token}));
    _catalogue = MerchantCatalogue.fromJson(result);
    return _catalogue!;
  }

  Future<void> saveProduct(MerchantProduct product) async {
    _requireSession();
    final index = _products.indexWhere((item) => item.id == product.id);
    final action = index >= 0 ? 'updateProduct' : 'createProduct';
    final saved = _map(await _post(
      action,
      product.toApiPayload(_token!, productId: index >= 0 ? product.id : null),
    ));
    final nextProduct = MerchantProduct.fromJson(_map(saved));
    if (index >= 0) {
      _products[index] = nextProduct;
    } else {
      _products.insert(0, nextProduct);
    }
    _productsLoaded = true;
    notifyListeners();
  }

  Future<void> deleteProduct(String id) async {
    _requireSession();
    await _post('deleteProduct', {'token': _token, 'productId': id});
    _products.removeWhere((item) => item.id == id);
    _productsLoaded = true;
    notifyListeners();
  }

  Future<MerchantProfile> updateProfile(MerchantProfile profile) async {
    _requireSession();
    final updated = _map(await _post('updateProfile', _withoutEmpty({
      'token': _token,
      'storeName': profile.storeName,
      'whatsapp': profile.whatsapp,
      'bio': profile.bio,
      'city': profile.city,
      'address': profile.address,
      'deliveryPhone': profile.deliveryPhone,
      'logoUrl': profile.logoUrl,
      'coverUrl': profile.coverUrl,
    })));
    _profile = MerchantProfile.fromJson(_map(updated));
    await _persistProfile();
    notifyListeners();
    return _profile!;
  }

  void _requireSession() {
    if (!isSignedIn) throw StateError('انتهت الجلسة. سجل دخول مرة ثانية.');
  }

  void _notifyChangedOrders(List<MerchantOrder> nextOrders) {
    final nextSignatures = _orderSnapshot(nextOrders);
    if (!_ordersSnapshotReady) {
      _orderSignatures
        ..clear()
        ..addAll(nextSignatures);
      _ordersSnapshotReady = true;
      return;
    }

    MerchantOrder? changed;
    for (final order in nextOrders) {
      if (_orderSignatures[order.id] != nextSignatures[order.id]) {
        changed = order;
        break;
      }
    }
    _orderSignatures
      ..clear()
      ..addAll(nextSignatures);
    if (changed == null) return;

    unawaited(NotificationService.instance.show(
      title: 'Botlly Merchant',
      body: 'تم تحديث طلب: ${changed.productTitle}',
      id: changed.id.hashCode & 0x7fffffff,
    ));
  }

  void _rememberOrderSnapshot(List<MerchantOrder> nextOrders) {
    _orderSignatures
      ..clear()
      ..addAll(_orderSnapshot(nextOrders));
    _ordersSnapshotReady = true;
  }

  Map<String, String> _orderSnapshot(List<MerchantOrder> nextOrders) {
    return {
      for (final order in nextOrders) order.id: _orderSignature(order),
    };
  }

  String _orderSignature(MerchantOrder order) {
    return [
      order.status,
      order.merchantStatus,
      order.requesterStatus,
      order.finalStatus,
      order.productPrice.toStringAsFixed(2),
      order.currency,
      order.customerDetails,
      order.merchantNote,
      order.sentToDelivery.toString(),
      order.createdAt.toIso8601String(),
    ].join('|');
  }

  Future<dynamic> _post(String action, Map<String, dynamic> data) async {
    final uri = Uri.parse('${apiBaseUrl.replaceAll(RegExp(r'/$'), '')}/api/merchant/mobile');
    final response = await http
        .post(
          uri,
          headers: const {
            'content-type': 'application/json; charset=utf-8',
            'accept': 'application/json',
          },
          body: jsonEncode({'action': action, 'data': data}),
        )
        .timeout(const Duration(seconds: 30));
    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    if (decoded is! Map<String, dynamic>) {
      throw StateError('استجابة غير مفهومة من الخادم.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300 || decoded['ok'] != true) {
      throw StateError(_string(decoded['error'], fallback: 'تعذر الاتصال بالباكند.'));
    }
    return decoded['result'];
  }

  Future<List<dynamic>> _postList(String action, Map<String, dynamic> data) async {
    final result = await _post(action, data);
    if (result is Map<String, dynamic> && result['items'] is List) {
      return result['items'] as List<dynamic>;
    }
    return _list(result);
  }

  Future<void> _persistProfile() async {
    final profile = _profile;
    final token = _token;
    if (profile == null || token == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('merchant_token', token);
    await prefs.setString('merchant_id', profile.id);
    await prefs.setString('merchant_store_name', profile.storeName);
    await prefs.setString('merchant_whatsapp', profile.whatsapp);
    await prefs.setString('merchant_city', profile.city);
    await prefs.setString('merchant_slug', profile.storeSlug ?? '');
    await prefs.setString('merchant_bio', profile.bio ?? '');
    await prefs.setString('merchant_address', profile.address ?? '');
    await prefs.setString('merchant_delivery_phone', profile.deliveryPhone ?? '');
  }

  @override
  void dispose() {
    _ordersTimer?.cancel();
    super.dispose();
  }
}

Map<String, dynamic> _map(Object? value) {
  return value is Map<String, dynamic> ? value : <String, dynamic>{};
}

List<dynamic> _list(Object? value) {
  return value is List ? value : const [];
}

class SplashGate extends StatefulWidget {
  const SplashGate({super.key});

  @override
  State<SplashGate> createState() => _SplashGateState();
}

class _SplashGateState extends State<SplashGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_restore());
    });
  }

  Future<void> _restore() async {
    final repository = MerchantScope.of(context);
    await repository.restoreSession();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => repository.isSignedIn ? const MerchantHome() : const AuthScreen(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final storeName = TextEditingController();
  final whatsapp = TextEditingController();
  final password = TextEditingController();
  final otpCode = TextEditingController();
  final selectedCarMakes = <String>{};
  final selectedCarModels = <String>{};
  final selectedSpecialties = <String>{};
  var mode = AuthMode.login;
  var city = governorates.first;
  var loading = false;
  var showReset = false;
  var showPassword = false;
  MerchantCatalogue signupCatalogue = MerchantCatalogue.empty;

  static const partSpecialties = <String>[
    'كهربائيات عامة',
    'محرك',
    'هيكل وبدن',
    'تعليق وتوجيه',
    'فرامل',
    'تبريد وتكييف',
    'إكسسوارات',
    'أخرى',
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_loadSignupCatalogue());
    });
  }

  @override
  void dispose() {
    storeName.dispose();
    whatsapp.dispose();
    password.dispose();
    otpCode.dispose();
    super.dispose();
  }

  Future<void> _loadSignupCatalogue() async {
    try {
      final catalogue = await MerchantScope.of(context).getSignupCatalogue();
      if (!mounted) return;
      setState(() => signupCatalogue = catalogue);
    } catch (_) {
      // Keep signup usable if the catalogue endpoint is temporarily unavailable.
    }
  }

  void _toggleMake(String label, bool checked) {
    setState(() {
      if (checked) {
        selectedCarMakes.add(label);
      } else {
        selectedCarMakes.remove(label);
        final allowedModels = signupCatalogue.makes
            .where((make) => selectedCarMakes.contains(make.label))
            .expand((make) => make.models)
            .toSet();
        selectedCarModels.removeWhere((model) => !allowedModels.contains(model));
      }
    });
  }

  void _toggleSet(Set<String> target, String value, bool checked) {
    setState(() {
      if (checked) {
        target.add(value);
      } else {
        target.remove(value);
      }
    });
  }

  Future<void> _requestOtp(String purpose) async {
    setState(() => loading = true);
    try {
      await MerchantScope.of(context).requestOtp(
        whatsapp: whatsapp.text,
        purpose: purpose,
      );
      if (mounted) _showMessage(context, 'تم إرسال رمز التحقق إلى واتساب');
    } catch (error) {
      if (mounted) _showMessage(context, _localizedError(context, error));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _resetPassword() async {
    setState(() => loading = true);
    try {
      await MerchantScope.of(context).resetPassword(
        whatsapp: whatsapp.text,
        password: password.text,
        otpCode: otpCode.text,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(builder: (_) => const MerchantHome()),
      );
    } catch (error) {
      if (mounted) _showMessage(context, _localizedError(context, error));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _submit() async {
    final t = LocaleScope.textOf(context);
    if (whatsapp.text.trim().isEmpty || password.text.isEmpty) {
      _showMessage(context, t.missingLoginFields);
      return;
    }
    if (mode == AuthMode.signup &&
        (storeName.text.trim().isEmpty ||
            city.trim().isEmpty ||
            otpCode.text.trim().isEmpty ||
            selectedCarMakes.isEmpty ||
            selectedCarModels.isEmpty ||
            selectedSpecialties.isEmpty)) {
      _showMessage(context, t.missingSignupFields);
      return;
    }
    setState(() => loading = true);
    try {
      final repository = MerchantScope.of(context);
      if (mode == AuthMode.login) {
        await repository.login(whatsapp: whatsapp.text, password: password.text);
      } else {
        await repository.signup(
          storeName: storeName.text,
          whatsapp: whatsapp.text,
          password: password.text,
          city: city,
          otpCode: otpCode.text,
          carMakes: selectedCarMakes.toList(),
          carModels: selectedCarModels.toList(),
          specialties: selectedSpecialties.toList(),
        );
      }
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(builder: (_) => const MerchantHome()),
      );
    } catch (error) {
      _showMessage(context, _localizedError(context, error));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = LocaleScope.textOf(context);
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Row(
              children: [
                const Expanded(child: _BrandHeader()),
                const _LanguageButton(),
              ],
            ),
            const SizedBox(height: 24),
            Text(
              showReset ? t.resetPassword : t.merchantLogin,
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(
              showReset ? t.resetHint : t.authHint,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.black54),
            ),
            const SizedBox(height: 24),
            if (showReset) ...[
              TextField(controller: whatsapp, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: t.whatsapp)),
              const SizedBox(height: 12),
              TextField(controller: otpCode, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'رمز OTP')),
              const SizedBox(height: 12),
              TextField(
                controller: password,
                obscureText: !showPassword,
                decoration: InputDecoration(
                  labelText: t.password,
                  suffixIcon: IconButton(
                    onPressed: () => setState(() => showPassword = !showPassword),
                    icon: Icon(showPassword ? Icons.visibility_off_rounded : Icons.visibility_rounded),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: loading ? null : () => _requestOtp('reset'),
                icon: const Icon(Icons.sms_rounded),
                label: const Text('إرسال OTP إلى واتساب'),
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: loading ? null : _resetPassword,
                icon: const Icon(Icons.lock_reset_rounded),
                label: const Text('تغيير كلمة المرور'),
              ),
              TextButton(onPressed: () => setState(() => showReset = false), child: Text(t.back)),
            ] else ...[
              SegmentedButton<AuthMode>(
                segments: [
                  ButtonSegment(value: AuthMode.login, label: Text(t.login), icon: const Icon(Icons.login_rounded)),
                  ButtonSegment(value: AuthMode.signup, label: Text(t.signup), icon: const Icon(Icons.storefront_rounded)),
                ],
                selected: {mode},
                onSelectionChanged: (value) => setState(() => mode = value.first),
              ),
              const SizedBox(height: 16),
              TextField(controller: whatsapp, keyboardType: TextInputType.phone, textDirection: ui.TextDirection.ltr, decoration: InputDecoration(labelText: t.whatsapp)),
              const SizedBox(height: 12),
              if (mode == AuthMode.signup) ...[
                TextField(controller: storeName, decoration: InputDecoration(labelText: t.storeName)),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: city,
                  decoration: InputDecoration(labelText: t.governorate),
                  items: governorates.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                  onChanged: (value) => setState(() => city = value ?? governorates.first),
                ),
                const SizedBox(height: 12),
                _CheckboxSection(
                  title: 'أنواع السيارات',
                  hint: 'اختر نوعاً واحداً أو أكثر',
                  children: signupCatalogue.makes.isEmpty
                      ? [const Text('جاري تحميل أنواع السيارات...')]
                      : signupCatalogue.makes
                          .map((make) => CheckboxListTile(
                                contentPadding: EdgeInsets.zero,
                                value: selectedCarMakes.contains(make.label),
                                title: Text(make.label),
                                controlAffinity: ListTileControlAffinity.leading,
                                onChanged: (value) => _toggleMake(make.label, value == true),
                              ))
                          .toList(),
                ),
                const SizedBox(height: 12),
                _CheckboxSection(
                  title: 'الموديلات',
                  hint: 'تظهر موديلات أنواع السيارات المحددة فقط',
                  children: selectedCarMakes.isEmpty
                      ? [const Text('اختر نوع السيارة أولاً.')]
                      : signupCatalogue.makes
                          .where((make) => selectedCarMakes.contains(make.label))
                          .expand((make) => make.models.map((model) => CheckboxListTile(
                                contentPadding: EdgeInsets.zero,
                                value: selectedCarModels.contains(model),
                                title: Text('${make.label} - $model'),
                                controlAffinity: ListTileControlAffinity.leading,
                                onChanged: (value) => _toggleSet(selectedCarModels, model, value == true),
                              )))
                          .toList(),
                ),
                const SizedBox(height: 12),
                _CheckboxSection(
                  title: 'الاختصاصات',
                  hint: 'اختر اختصاصاً واحداً أو أكثر',
                  children: partSpecialties
                      .map((item) => CheckboxListTile(
                            contentPadding: EdgeInsets.zero,
                            value: selectedSpecialties.contains(item),
                            title: Text(item),
                            controlAffinity: ListTileControlAffinity.leading,
                            onChanged: (value) => _toggleSet(selectedSpecialties, item, value == true),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 12),
                TextField(controller: otpCode, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'رمز OTP')),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: loading ? null : () => _requestOtp('signup'),
                  icon: const Icon(Icons.sms_rounded),
                  label: const Text('إرسال OTP إلى واتساب'),
                ),
                const SizedBox(height: 12),
              ],
              TextField(
                controller: password,
                obscureText: !showPassword,
                decoration: InputDecoration(
                  labelText: t.password,
                  suffixIcon: IconButton(
                    onPressed: () => setState(() => showPassword = !showPassword),
                    icon: Icon(showPassword ? Icons.visibility_off_rounded : Icons.visibility_rounded),
                  ),
                ),
              ),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton(onPressed: () => setState(() => showReset = true), child: Text(t.forgotPassword)),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: loading ? null : _submit,
                icon: loading
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.arrow_back_rounded),
                label: Text(mode == AuthMode.login ? t.enterDashboard : t.createAccount),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

enum AuthMode { login, signup }

class _CheckboxSection extends StatelessWidget {
  const _CheckboxSection({
    required this.title,
    required this.hint,
    required this.children,
  });

  final String title;
  final String hint;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Colors.black12),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(hint, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.black54)),
            const SizedBox(height: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 260),
              child: ListView(
                shrinkWrap: true,
                children: children,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class MerchantHome extends StatefulWidget {
  const MerchantHome({super.key});

  @override
  State<MerchantHome> createState() => _MerchantHomeState();
}

class _MerchantHomeState extends State<MerchantHome> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AnimatedBuilder(
        animation: MerchantScope.of(context),
        builder: (context, _) => const OrdersScreen(),
      ),
    );
  }
}

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = LocaleScope.textOf(context);
    final repository = MerchantScope.of(context);
    return FutureBuilder<MerchantDashboard>(
      future: repository.getDashboard(),
      builder: (context, snapshot) {
        final dashboard = snapshot.data;
        return _PageScaffold(
          title: t.greeting(dashboard?.profile.storeName ?? ''),
          subtitle: t.dashboardSubtitle,
          actions: [
            const _LanguageButton(),
            IconButton.filledTonal(
              tooltip: t.signOut,
              onPressed: () async {
                await repository.signOut();
                if (context.mounted) {
                  Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => const AuthScreen()));
                }
              },
              icon: const Icon(Icons.logout_rounded),
            ),
          ],
          child: snapshot.connectionState != ConnectionState.done
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        _StatTile(icon: Icons.inventory_2_rounded, label: t.products, value: '${dashboard!.products.length}'),
                        _StatTile(icon: Icons.search_rounded, label: t.search, value: '0'),
                        _StatTile(icon: Icons.shopping_bag_rounded, label: t.orders, value: '${dashboard.orders.length}'),
                        _StatTile(icon: Icons.trending_up_rounded, label: t.completion, value: '${dashboard.completion}%'),
                      ],
                    ),
                    const SizedBox(height: 18),
                    _SectionCard(
                      title: t.latestProducts,
                      child: dashboard.products.isEmpty
                          ? _EmptyHint(text: t.noProductsYet)
                          : Column(
                              children: dashboard.products.take(4).map((product) => _ProductListTile(product: product)).toList(),
                            ),
                    ),
                    const SizedBox(height: 18),
                    _SectionCard(
                      title: t.profileCompletion,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(t.profileCompletionHint),
                          const SizedBox(height: 12),
                          LinearProgressIndicator(value: dashboard.completion / 100),
                          const SizedBox(height: 6),
                          Text('${dashboard.completion}%'),
                        ],
                      ),
                    ),
                  ],
                ),
        );
      },
    );
  }
}

class ProductsScreen extends StatefulWidget {
  const ProductsScreen({super.key});

  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> {
  var query = '';
  late Future<List<MerchantProduct>> _productsFuture;
  var _loadedProductsOnce = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_loadedProductsOnce) {
      _productsFuture = MerchantScope.of(context).listProducts();
      _loadedProductsOnce = true;
    }
  }

  void _refreshProducts() {
    setState(() {
      _productsFuture = MerchantScope.of(context).listProducts(force: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = LocaleScope.textOf(context);
    final repository = MerchantScope.of(context);
    return FutureBuilder<List<MerchantProduct>>(
      future: _productsFuture,
      builder: (context, snapshot) {
        final products = (snapshot.data ?? [])
            .where((product) => '${product.title} ${product.description} ${product.color ?? ''} ${product.size ?? ''}'.contains(query))
            .toList();
        return _PageScaffold(
          title: t.products,
          subtitle: t.productsSubtitle,
          actions: [
            IconButton.filled(
              tooltip: t.addProduct,
              onPressed: () => _openProductSheet(context).then((changed) {
                if (changed == true && mounted) _refreshProducts();
              }),
              icon: const Icon(Icons.add_rounded),
            ),
          ],
          child: Column(
            children: [
              TextField(
                decoration: InputDecoration(prefixIcon: const Icon(Icons.search_rounded), labelText: t.search),
                onChanged: (value) => setState(() => query = value),
              ),
              const SizedBox(height: 16),
              if (snapshot.connectionState != ConnectionState.done)
                const Expanded(child: Center(child: CircularProgressIndicator()))
              else if (products.isEmpty)
                Expanded(
                  child: _EmptyHint(
                    text: t.noMatchingProducts,
                    action: FilledButton.icon(
                      onPressed: () => _openProductSheet(context).then((changed) {
                        if (changed == true && mounted) _refreshProducts();
                      }),
                      icon: const Icon(Icons.add_rounded),
                      label: Text(t.addProduct),
                    ),
                  ),
                )
              else
                Expanded(
                  child: ListView.separated(
                    itemCount: products.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final product = products[index];
                      return _ProductCard(
                        product: product,
                        onEdit: () => _openProductSheet(context, product: product).then((changed) {
                          if (changed == true && mounted) _refreshProducts();
                        }),
                        onDelete: () async {
                          await repository.deleteProduct(product.id);
                          if (context.mounted) _showMessage(context, t.productDeleted);
                          if (mounted) _refreshProducts();
                        },
                      );
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  late Future<List<MerchantOrder>> _ordersFuture;
  MerchantRepository? _repository;
  final Map<String, String> _offerPrices = {};
  final Map<String, String> _offerCurrencies = {};
  final Map<String, String> _offerNotes = {};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final nextRepository = MerchantScope.of(context);
    if (_repository != nextRepository) {
      _repository?.removeListener(_handleRepositoryChanged);
      _repository = nextRepository;
      _repository!.addListener(_handleRepositoryChanged);
    }
    _ordersFuture = nextRepository.listOrders(force: true);
  }

  @override
  void dispose() {
    _repository?.removeListener(_handleRepositoryChanged);
    super.dispose();
  }

  void _handleRepositoryChanged() {
    if (!mounted) return;
    setState(() {
      _ordersFuture = MerchantScope.of(context).listOrders();
    });
  }

  void _refresh() {
    setState(() {
      _ordersFuture = MerchantScope.of(context).listOrders(force: true);
    });
  }

  String _offerPrice(MerchantOrder order) {
    return _offerPrices.putIfAbsent(
      order.id,
      () => order.productPrice > 0 ? order.productPrice.toStringAsFixed(order.productPrice.truncateToDouble() == order.productPrice ? 0 : 2) : '',
    );
  }

  String _offerCurrency(MerchantOrder order) {
    return _offerCurrencies.putIfAbsent(order.id, () => order.currency == 'USD' ? 'USD' : 'IQD');
  }

  String _offerNote(MerchantOrder order) {
    return _offerNotes.putIfAbsent(order.id, () => order.merchantNote);
  }

  @override
  Widget build(BuildContext context) {
    final t = LocaleScope.textOf(context);
    final repository = MerchantScope.of(context);
    return FutureBuilder<List<MerchantOrder>>(
      future: _ordersFuture,
      builder: (context, snapshot) {
        final orders = snapshot.data ?? [];
        return _PageScaffold(
          title: t.orders,
          subtitle: t.ordersSubtitle,
          child: snapshot.connectionState != ConnectionState.done
              ? const Center(child: CircularProgressIndicator())
              : orders.isEmpty
                  ? _EmptyHint(text: t.noOrders)
                  : ListView.separated(
                      itemCount: orders.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final order = orders[index];
                        final offerPrice = _offerPrice(order);
                        final offerCurrency = _offerCurrency(order);
                        final offerNote = _offerNote(order);
                        return Card(
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(child: Text(order.productTitle, style: const TextStyle(fontWeight: FontWeight.w800))),
                                    Chip(label: Text(order.status == 'confirmed' ? t.confirmed : order.status)),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text('${numberFormatFor(context).format(order.productPrice)} ${order.currency}'),
                                Text(order.customerNumber, textDirection: ui.TextDirection.ltr),
                                Text(order.customerDetails),
                                if (order.sentToDelivery) Text(t.sentToDelivery),
                                const SizedBox(height: 12),
                                if (order.canMarkAvailability)
                                  Container(
                                    padding: const EdgeInsets.all(10),
                                    decoration: BoxDecoration(
                                      border: Border.all(color: const Color(0xffd1d5db)),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Column(
                                      children: [
                                        TextFormField(
                                          initialValue: offerPrice,
                                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                          textDirection: ui.TextDirection.ltr,
                                          decoration: const InputDecoration(labelText: 'السعر النهائي'),
                                          onChanged: (value) => _offerPrices[order.id] = value,
                                        ),
                                        const SizedBox(height: 8),
                                        DropdownButtonFormField<String>(
                                          initialValue: offerCurrency,
                                          decoration: const InputDecoration(labelText: 'العملة'),
                                          items: const [
                                            DropdownMenuItem(value: 'IQD', child: Text('IQD')),
                                            DropdownMenuItem(value: 'USD', child: Text('USD')),
                                          ],
                                          onChanged: (value) => setState(() => _offerCurrencies[order.id] = value ?? 'IQD'),
                                        ),
                                        const SizedBox(height: 8),
                                        TextFormField(
                                          initialValue: offerNote,
                                          decoration: const InputDecoration(labelText: 'ملاحظة عن القطعة أو العرض'),
                                          onChanged: (value) => _offerNotes[order.id] = value,
                                        ),
                                      ],
                                    ),
                                  ),
                                if (order.canMarkAvailability) const SizedBox(height: 12),
                                if (order.canMarkAvailability) Row(
                                  children: [
                                    Expanded(
                                      child: FilledButton.icon(
                                        onPressed: () async {
                                          final parsedPrice = double.tryParse((_offerPrices[order.id] ?? '').replaceAll(',', '.'));
                                          await repository.markOrderAvailable(
                                            order.id,
                                            finalPrice: parsedPrice,
                                            currency: _offerCurrencies[order.id] ?? 'IQD',
                                            merchantNote: _offerNotes[order.id] ?? '',
                                          );
                                          if (context.mounted) _showMessage(context, 'تم تأكيد توفر المنتج');
                                          _refresh();
                                        },
                                        icon: const Icon(Icons.check_circle_rounded),
                                        label: const Text('المنتج متوفر'),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: OutlinedButton.icon(
                                        onPressed: () async {
                                          await repository.markOrderUnavailable(order.id);
                                          if (context.mounted) _showMessage(context, 'تم تأكيد عدم توفر المنتج');
                                          _refresh();
                                        },
                                        icon: const Icon(Icons.cancel_rounded),
                                        label: const Text('المنتج غير متوفر'),
                                      ),
                                    ),
                                  ],
                                ),
                                if (order.canConfirmSale) Row(
                                  children: [
                                    Expanded(
                                      child: FilledButton.icon(
                                        onPressed: () async {
                                          await repository.markOrderSold(order.id);
                                          if (context.mounted) _showMessage(context, 'تم بيع المنتج');
                                          _refresh();
                                        },
                                        icon: const Icon(Icons.check_circle_rounded),
                                        label: const Text('تم بيع المنتج'),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: OutlinedButton.icon(
                                        onPressed: () async {
                                          await repository.markOrderCancelled(order.id);
                                          if (context.mounted) _showMessage(context, 'تم إلغاء الطلب');
                                          _refresh();
                                        },
                                        icon: const Icon(Icons.cancel_rounded),
                                        label: const Text('تم إلغاء الطلب'),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
        );
      },
    );
  }
}

class StoreProfileScreen extends StatefulWidget {
  const StoreProfileScreen({super.key});

  @override
  State<StoreProfileScreen> createState() => _StoreProfileScreenState();
}

class _StoreProfileScreenState extends State<StoreProfileScreen> {
  final storeName = TextEditingController();
  final whatsapp = TextEditingController();
  final bio = TextEditingController();
  final address = TextEditingController();
  final deliveryPhone = TextEditingController();
  var city = governorates.first;
  var initialized = false;

  @override
  void dispose() {
    storeName.dispose();
    whatsapp.dispose();
    bio.dispose();
    address.dispose();
    deliveryPhone.dispose();
    super.dispose();
  }

  void _init(MerchantProfile profile) {
    if (initialized) return;
    initialized = true;
    storeName.text = profile.storeName;
    whatsapp.text = profile.whatsapp;
    bio.text = profile.bio ?? '';
    address.text = profile.address ?? '';
    deliveryPhone.text = profile.deliveryPhone ?? '';
    city = profile.city;
  }

  @override
  Widget build(BuildContext context) {
    final t = LocaleScope.textOf(context);
    final repository = MerchantScope.of(context);
    final profile = repository.profile;
    if (profile != null) _init(profile);
    return _PageScaffold(
      title: t.storePage,
      subtitle: t.storeSubtitle,
      actions: [
        IconButton.filledTonal(
          tooltip: t.preview,
          onPressed: () async {
            final slug = repository.profile?.storeSlug ?? 'store';
            final uri = Uri.parse('https://bot-lly.tech/store/$slug');
            if (await canLaunchUrl(uri)) unawaited(launchUrl(uri, mode: LaunchMode.externalApplication));
          },
          icon: const Icon(Icons.open_in_new_rounded),
        ),
      ],
      child: ListView(
        children: [
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                Container(
                  height: 150,
                  alignment: Alignment.center,
                  color: const Color(0xffdcfce7),
                  child: const Icon(Icons.image_rounded, size: 42, color: Color(0xff16a34a)),
                ),
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Theme.of(context).colorScheme.primary,
                    child: const Icon(Icons.storefront_rounded, color: Colors.white),
                  ),
                  title: Text(t.storeImages),
                  subtitle: Text(t.storeImagesHint),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          TextField(controller: storeName, decoration: InputDecoration(labelText: t.storeName)),
          const SizedBox(height: 12),
          TextField(controller: whatsapp, keyboardType: TextInputType.phone, textDirection: ui.TextDirection.ltr, decoration: InputDecoration(labelText: t.merchantWhatsapp)),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: governorates.contains(city) ? city : governorates.first,
            decoration: InputDecoration(labelText: t.governorate),
            items: governorates.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
            onChanged: (value) => setState(() => city = value ?? governorates.first),
          ),
          const SizedBox(height: 12),
          TextField(controller: bio, maxLines: 3, decoration: InputDecoration(labelText: t.storeBio)),
          const SizedBox(height: 12),
          TextField(controller: address, maxLines: 3, decoration: InputDecoration(labelText: t.storeAddress)),
          const SizedBox(height: 12),
          TextField(controller: deliveryPhone, keyboardType: TextInputType.phone, textDirection: ui.TextDirection.ltr, decoration: InputDecoration(labelText: t.deliveryPhone)),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: () async {
              final current = repository.profile;
              if (current == null) return;
              await repository.updateProfile(
                current.copyWith(
                  storeName: storeName.text.trim(),
                  whatsapp: whatsapp.text.trim(),
                  city: city,
                  bio: bio.text.trim(),
                  address: address.text.trim(),
                  deliveryPhone: deliveryPhone.text.trim(),
                ),
              );
              if (context.mounted) _showMessage(context, t.storeSaved);
            },
            icon: const Icon(Icons.save_rounded),
            label: Text(t.saveContinue),
          ),
        ],
      ),
    );
  }
}

class _PageScaffold extends StatelessWidget {
  const _PageScaffold({
    required this.title,
    required this.subtitle,
    required this.child,
    this.actions = const [],
  });

  final String title;
  final String subtitle;
  final Widget child;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.shopping_bag_rounded, color: Colors.white, size: 20),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
                      const SizedBox(height: 4),
                      Text(subtitle, style: const TextStyle(color: Colors.black54)),
                    ],
                  ),
                ),
                ...actions,
              ],
            ),
            const SizedBox(height: 16),
            Expanded(child: child),
          ],
        ),
      ),
    );
  }
}

class _BrandHeader extends StatelessWidget {
  const _BrandHeader();

  @override
  Widget build(BuildContext context) {
    final t = LocaleScope.textOf(context);
    return Row(
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primary,
            borderRadius: BorderRadius.circular(14),
          ),
          child: const Icon(Icons.storefront_rounded, color: Colors.white),
        ),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(t.appTitle, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
            Text(t.appSubtitle, style: const TextStyle(color: Colors.black54)),
          ],
        ),
      ],
    );
  }
}

class _LanguageButton extends StatelessWidget {
  const _LanguageButton();

  @override
  Widget build(BuildContext context) {
    final selected = LocaleScope.languageOf(context);
    return PopupMenuButton<AppLanguage>(
      tooltip: 'Language',
      icon: const Icon(Icons.language_rounded),
      initialValue: selected,
      onSelected: (language) => LocaleScope.setLanguage(context, language),
      itemBuilder: (context) => AppLanguage.values
          .map(
            (language) => PopupMenuItem(
              value: language,
              child: Row(
                children: [
                  if (language == selected) const Icon(Icons.check_rounded, size: 18) else const SizedBox(width: 18),
                  const SizedBox(width: 8),
                  Text(language.label),
                ],
              ),
            ),
          )
          .toList(),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: (MediaQuery.sizeOf(context).width - 44) / 2,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 12),
              Text(value, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 24)),
              Text(label, style: const TextStyle(color: Colors.black54)),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}

class _ProductListTile extends StatelessWidget {
  const _ProductListTile({required this.product});

  final MerchantProduct product;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(
        backgroundColor: const Color(0xffdcfce7),
        child: Icon(Icons.inventory_2_rounded, color: Theme.of(context).colorScheme.primary),
      ),
      title: Text(product.title, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text([product.color, product.size].where((item) => item != null && item!.isNotEmpty).join(' - ')),
      trailing: Text('${numberFormatFor(context).format(product.customerPrice)} ${product.currency}'),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.product,
    required this.onEdit,
    required this.onDelete,
  });

  final MerchantProduct product;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final primaryImage = product.imageUrls.isNotEmpty ? product.imageUrls.first : product.imageUrl;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: SizedBox(
                    height: 54,
                    width: 54,
                    child: primaryImage.isEmpty
                        ? DecoratedBox(
                            decoration: const BoxDecoration(color: Color(0xffdcfce7)),
                            child: Icon(Icons.directions_car_rounded, color: Theme.of(context).colorScheme.primary),
                          )
                        : Image(image: _productImageProvider(primaryImage), fit: BoxFit.cover),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(product.title, style: const TextStyle(fontWeight: FontWeight.w900)),
                      Text(product.description, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                if (product.quantity != null) Chip(label: Text('${product.quantity}')),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                if (product.carMake != null) Chip(label: Text(product.carMake!)),
                if (product.carModel != null) Chip(label: Text(product.carModel!)),
                if (product.carYear != null) Chip(label: Text(product.carYear!)),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text('${numberFormatFor(context).format(product.customerPrice)} ${product.currency}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                const Spacer(),
                IconButton(onPressed: onEdit, icon: const Icon(Icons.edit_rounded)),
                IconButton(onPressed: onDelete, icon: const Icon(Icons.delete_rounded), color: Colors.red),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint({required this.text, this.action});

  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.inventory_2_outlined, size: 56, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 12),
            Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black54)),
            if (action != null) ...[
              const SizedBox(height: 16),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}

Future<bool?> _openProductSheet(BuildContext context, {MerchantProduct? product}) async {
  final t = LocaleScope.textOf(context);
  final repository = MerchantScope.of(context);
  late final MerchantCatalogue catalogue;
  try {
    catalogue = await repository.getCatalogue();
  } catch (error) {
    if (context.mounted) {
      _showMessage(context, _localizedError(context, error));
    }
    return false;
  }

  final title = TextEditingController(text: product?.title ?? '');
  final description = TextEditingController(text: product?.description ?? '');
  final price = TextEditingController(text: product == null ? '' : product.currentPrice.toStringAsFixed(0));
  final discount = TextEditingController(text: product?.discountPrice?.toStringAsFixed(0) ?? '');
  final quantity = TextEditingController(text: product?.quantity?.toString() ?? '');
  final size = TextEditingController(text: product?.size ?? '');
  var selectedCurrency = product?.currency ?? 'IQD';
  var selectedColor = product?.color ?? '';
  var selectedMake = product?.carMake ?? '';
  var selectedModel = product?.carModel ?? '';
  var selectedYear = product?.carYear ?? '';
  var images = <String>[
    ...product?.imageUrls ?? const <String>[],
    if ((product?.imageUrls.isEmpty ?? true) && (product?.imageUrl.isNotEmpty ?? false))
      product!.imageUrl,
  ].where((image) => image.isNotEmpty).take(maxProductImages).toList();
  var saving = false;

  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) {
      return StatefulBuilder(
        builder: (context, setSheetState) {
          final make = catalogue.makes.firstWhere(
            (item) => item.label == selectedMake || item.key == selectedMake,
            orElse: () => const CarMakeOption(key: '', label: '', models: []),
          );
          final models = make.models;

          Future<void> addImages(ImageSource source) async {
            final picked = await _pickProductImages(source, maxProductImages - images.length);
            if (picked.isEmpty) return;
            setSheetState(() {
              images = [...images, ...picked].take(maxProductImages).toList();
            });
          }

          return Padding(
            padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 16),
            child: ListView(
              shrinkWrap: true,
              children: [
                Text(
                  product == null ? t.addProduct : t.editProduct,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 14),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t.productPhotos(images.length), style: const TextStyle(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: images.length >= maxProductImages ? null : () => addImages(ImageSource.camera),
                                icon: const Icon(Icons.camera_alt_rounded),
                                label: Text(t.camera),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: images.length >= maxProductImages ? null : () => addImages(ImageSource.gallery),
                                icon: const Icon(Icons.photo_library_rounded),
                                label: Text(t.gallery),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        if (images.isEmpty)
                          _EmptyHint(text: t.photoHint)
                        else
                          GridView.builder(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 3,
                              crossAxisSpacing: 8,
                              mainAxisSpacing: 8,
                            ),
                            itemCount: images.length,
                            itemBuilder: (context, index) {
                              return Stack(
                                fit: StackFit.expand,
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(10),
                                    child: Image(image: _productImageProvider(images[index]), fit: BoxFit.cover),
                                  ),
                                  if (index == 0)
                                    Positioned(
                                      bottom: 4,
                                      right: 4,
                                      child: DecoratedBox(
                                        decoration: BoxDecoration(
                                          color: Theme.of(context).colorScheme.primary,
                                          borderRadius: BorderRadius.circular(6),
                                        ),
                                        child: Padding(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          child: Text(t.primary, style: const TextStyle(color: Colors.white, fontSize: 10)),
                                        ),
                                      ),
                                    ),
                                  Positioned(
                                    top: 2,
                                    left: 2,
                                    child: IconButton.filledTonal(
                                      iconSize: 16,
                                      onPressed: () => setSheetState(() => images.removeAt(index)),
                                      icon: const Icon(Icons.close_rounded),
                                    ),
                                  ),
                                ],
                              );
                            },
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(controller: title, decoration: InputDecoration(labelText: t.productName)),
                const SizedBox(height: 10),
                TextField(controller: description, maxLines: 2, decoration: InputDecoration(labelText: t.description)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(child: TextField(controller: price, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: t.currentPrice))),
                    const SizedBox(width: 10),
                    Expanded(child: TextField(controller: discount, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: t.finalPrice))),
                  ],
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: const ['IQD', 'USD'].contains(selectedCurrency) ? selectedCurrency : 'IQD',
                  decoration: InputDecoration(labelText: t.currency),
                  items: ['IQD', 'USD']
                      .map((code) => DropdownMenuItem(value: code, child: Text(t.currencyName(code))))
                      .toList(),
                  onChanged: (value) => setSheetState(() => selectedCurrency = value ?? 'IQD'),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(child: TextField(controller: quantity, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: t.quantity))),
                    const SizedBox(width: 10),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: catalogue.colors.contains(selectedColor) ? selectedColor : null,
                        decoration: InputDecoration(labelText: t.color),
                        items: catalogue.colors.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                        onChanged: (value) => setSheetState(() => selectedColor = value ?? ''),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(controller: size, decoration: InputDecoration(labelText: t.size)),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: catalogue.makes.any((item) => item.label == selectedMake || item.key == selectedMake)
                      ? selectedMake
                      : null,
                  decoration: InputDecoration(labelText: t.carMake),
                  items: catalogue.makes.map((item) => DropdownMenuItem(value: item.label, child: Text(item.label))).toList(),
                  onChanged: (value) => setSheetState(() {
                    selectedMake = value ?? '';
                    selectedModel = '';
                  }),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: models.contains(selectedModel) ? selectedModel : null,
                  decoration: InputDecoration(labelText: t.carModel),
                  items: models.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                  onChanged: selectedMake.isEmpty ? null : (value) => setSheetState(() => selectedModel = value ?? ''),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedYear.isNotEmpty && catalogue.years.contains(selectedYear) ? selectedYear : null,
                  decoration: InputDecoration(labelText: t.carYear),
                  items: [
                    DropdownMenuItem(value: '', child: Text(t.allYears)),
                    ...catalogue.years.map((item) => DropdownMenuItem(value: item, child: Text(item))),
                  ],
                  onChanged: (value) => setSheetState(() => selectedYear = value ?? ''),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: saving
                      ? null
                      : () async {
                          final parsedPrice = double.tryParse(price.text.trim()) ?? 0;
                          if (images.isEmpty) {
                            _showMessage(context, t.photoRequired);
                            return;
                          }
                          if (title.text.trim().isEmpty || description.text.trim().isEmpty || parsedPrice <= 0) {
                            _showMessage(context, t.productRequired);
                            return;
                          }
                          setSheetState(() => saving = true);
                          try {
                            final next = (product ??
                                    MerchantProduct(
                                      id: 'p-${DateTime.now().millisecondsSinceEpoch}',
                                      title: title.text.trim(),
                                      description: description.text.trim(),
                                      currentPrice: parsedPrice,
                                      currency: selectedCurrency,
                                      createdAt: DateTime.now(),
                                    ))
                                .copyWith(
                              title: title.text.trim(),
                              description: description.text.trim(),
                              imageUrl: images.first,
                              imageUrls: images,
                              currentPrice: parsedPrice,
                              discountPrice: double.tryParse(discount.text.trim()),
                              currency: selectedCurrency,
                              quantity: int.tryParse(quantity.text.trim()),
                              color: selectedColor,
                              size: size.text.trim(),
                              carMake: selectedMake,
                              carModel: selectedModel,
                              carYear: selectedYear,
                            );
                            await repository.saveProduct(next);
                            if (context.mounted) {
                              Navigator.pop(context, true);
                              _showMessage(context, t.productSaved);
                            }
                          } catch (error) {
                            if (context.mounted) {
                              _showMessage(context, _localizedError(context, error));
                            }
                          } finally {
                            setSheetState(() => saving = false);
                          }
                        },
                  icon: saving
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.save_rounded),
                  label: Text(t.saveProduct),
                ),
              ],
            ),
          );
        },
      );
    },
  );
}

Future<List<String>> _pickProductImages(ImageSource source, int remainingSlots) async {
  if (remainingSlots <= 0) return const [];
  final picker = ImagePicker();
  final List<XFile> files;
  if (source == ImageSource.camera) {
    final file = await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1000,
      maxHeight: 1000,
      imageQuality: 78,
    );
    files = file == null ? const <XFile>[] : <XFile>[file];
  } else {
    files = await picker.pickMultiImage(
      maxWidth: 1000,
      maxHeight: 1000,
      imageQuality: 78,
    );
  }
  final images = <String>[];
  for (final file in files.take(remainingSlots)) {
    final bytes = await file.readAsBytes();
    images.add('data:image/jpeg;base64,${base64Encode(bytes)}');
  }
  return images;
}

ImageProvider _productImageProvider(String image) {
  if (image.startsWith('data:image/')) {
    try {
      final commaIndex = image.indexOf(',');
      if (commaIndex <= 0) return _placeholderImageProvider();
      final encoded = image.substring(commaIndex + 1);
      return MemoryImage(base64Decode(encoded));
    } catch (_) {
      return _placeholderImageProvider();
    }
  }
  final uri = Uri.tryParse(image);
  if (uri == null || !(uri.isScheme('http') || uri.isScheme('https'))) {
    return _placeholderImageProvider();
  }
  return NetworkImage(image);
}

ImageProvider _placeholderImageProvider() {
  final encoded = placeholderImage.substring(placeholderImage.indexOf(',') + 1);
  return MemoryImage(base64Decode(encoded));
}

void _showMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

String _localizedError(BuildContext context, Object error) {
  final t = LocaleScope.textOf(context);
  final message = error.toString().replaceFirst('Bad state: ', '');
  if (message.contains('انتهت الجلسة')) return t.sessionExpired;
  if (message.contains('رقم الواتساب وكلمة المرور')) return t.missingLoginFields;
  if (message.contains('اسم المحل ورقم الواتساب')) return t.missingSignupFields;
  if (message.contains('استجابة غير مفهومة')) return t.badResponse;
  if (message.contains('تعذر الاتصال بالباكند')) return t.backendError;
  return message;
}
