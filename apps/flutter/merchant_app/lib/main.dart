import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

void main() {
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

final numberFormat = NumberFormat.decimalPattern('ar');
const apiBaseUrl = String.fromEnvironment(
  'BOTLLY_API_BASE_URL',
  defaultValue: 'https://bot-lly.tech',
);
const placeholderImage =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const allYearsLabel = 'كل السنوات';
const maxProductImages = 6;
const _unset = Object();

class BotlyMerchantApp extends StatefulWidget {
  const BotlyMerchantApp({super.key});

  @override
  State<BotlyMerchantApp> createState() => _BotlyMerchantAppState();
}

class _BotlyMerchantAppState extends State<BotlyMerchantApp> {
  final repository = MerchantRepository();

  @override
  Widget build(BuildContext context) {
    return MerchantScope(
      repository: repository,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'بوتلي تاجر',
        locale: const Locale('ar'),
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
            textDirection: ui.TextDirection.rtl,
            child: child ?? const SizedBox.shrink(),
          );
        },
        home: const SplashGate(),
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
  final bool sentToDelivery;
  final DateTime createdAt;

  factory MerchantOrder.fromJson(Map<String, dynamic> json) {
    return MerchantOrder(
      id: _string(json['id'], fallback: 'order'),
      productTitle: _string(json['productTitle'], fallback: 'منتج'),
      productPrice: _double(json['productPrice']),
      currency: _string(json['currency'], fallback: 'IQD'),
      customerNumber: _string(json['customerNumber']),
      customerDetails: _string(json['customerDetails']),
      status: _string(json['status'], fallback: 'unknown'),
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
  MerchantProfile? _profile;
  String? _token;
  final _products = <MerchantProduct>[];
  final _orders = <MerchantOrder>[];
  MerchantCatalogue? _catalogue;
  bool _productsLoaded = false;
  bool _ordersLoaded = false;

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
    notifyListeners();
    return _profile!;
  }

  Future<MerchantProfile> signup({
    required String storeName,
    required String whatsapp,
    required String password,
    required String city,
    String? email,
  }) async {
    if (storeName.trim().isEmpty || whatsapp.trim().isEmpty || password.length < 6 || city.isEmpty) {
      throw StateError('اسم المحل ورقم الواتساب والمحافظة وكلمة المرور مطلوبة.');
    }
    final result = _map(await _post('signup', _withoutEmpty({
      'storeName': storeName.trim(),
      'whatsapp': whatsapp.trim(),
      'password': password,
      'city': city,
      'email': email,
    })));
    _token = _string(result['token']);
    _profile = MerchantProfile.fromJson(_map(result['profile']));
    await _persistProfile();
    notifyListeners();
    return _profile!;
  }

  Future<void> signOut() async {
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
    _orders
      ..clear()
      ..addAll(rows.map((item) => MerchantOrder.fromJson(_map(item))));
    _ordersLoaded = true;
    return List.unmodifiable(_orders);
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
  final email = TextEditingController();
  var mode = AuthMode.login;
  var city = governorates.first;
  var loading = false;
  var showReset = false;

  @override
  void dispose() {
    storeName.dispose();
    whatsapp.dispose();
    password.dispose();
    email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
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
          email: email.text.trim().isEmpty ? null : email.text.trim(),
        );
      }
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(builder: (_) => const MerchantHome()),
      );
    } catch (error) {
      _showMessage(context, error.toString().replaceFirst('Bad state: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const _BrandHeader(),
            const SizedBox(height: 24),
            Text(
              showReset ? 'استعادة كلمة المرور' : 'دخول التاجر',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(
              showReset
                  ? 'اختر رقم الواتساب أو الإيميل لإرسال كود إعادة التعيين.'
                  : 'سجل دخولك أو أنشئ متجر جديد لإدارة المنتجات والطلبات.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.black54),
            ),
            const SizedBox(height: 24),
            if (showReset) ...[
              TextField(controller: whatsapp, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'رقم الواتساب')),
              const SizedBox(height: 12),
              TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'الإيميل اختياري')),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () {
                  _showMessage(context, 'تم تجهيز طلب إعادة التعيين. سيتم ربطه بقالب واتساب/إيميل بالخطوة القادمة.');
                  setState(() => showReset = false);
                },
                icon: const Icon(Icons.send_rounded),
                label: const Text('إرسال كود التعيين'),
              ),
              TextButton(onPressed: () => setState(() => showReset = false), child: const Text('رجوع')),
            ] else ...[
              SegmentedButton<AuthMode>(
                segments: const [
                  ButtonSegment(value: AuthMode.login, label: Text('دخول'), icon: Icon(Icons.login_rounded)),
                  ButtonSegment(value: AuthMode.signup, label: Text('إنشاء'), icon: Icon(Icons.storefront_rounded)),
                ],
                selected: {mode},
                onSelectionChanged: (value) => setState(() => mode = value.first),
              ),
              const SizedBox(height: 16),
              if (mode == AuthMode.signup) ...[
                TextField(controller: storeName, decoration: const InputDecoration(labelText: 'اسم المحل أو الشركة')),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: city,
                  decoration: const InputDecoration(labelText: 'المحافظة'),
                  items: governorates.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                  onChanged: (value) => setState(() => city = value ?? governorates.first),
                ),
                const SizedBox(height: 12),
                TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'الإيميل اختياري')),
                const SizedBox(height: 12),
              ],
              TextField(controller: whatsapp, keyboardType: TextInputType.phone, textDirection: ui.TextDirection.ltr, decoration: const InputDecoration(labelText: 'رقم الواتساب')),
              const SizedBox(height: 12),
              TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'كلمة المرور')),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton(onPressed: () => setState(() => showReset = true), child: const Text('نسيت كلمة المرور؟')),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: loading ? null : _submit,
                icon: loading
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.arrow_back_rounded),
                label: Text(mode == AuthMode.login ? 'دخول إلى اللوحة' : 'إنشاء الحساب'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

enum AuthMode { login, signup }

class MerchantHome extends StatefulWidget {
  const MerchantHome({super.key});

  @override
  State<MerchantHome> createState() => _MerchantHomeState();
}

class _MerchantHomeState extends State<MerchantHome> {
  var index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [
      const DashboardScreen(),
      const ProductsScreen(),
      const OrdersScreen(),
      const StoreProfileScreen(),
    ];
    return Scaffold(
      body: AnimatedBuilder(
        animation: MerchantScope.of(context),
        builder: (context, _) => pages[index],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_rounded), label: 'الرئيسية'),
          NavigationDestination(icon: Icon(Icons.inventory_2_rounded), label: 'المنتجات'),
          NavigationDestination(icon: Icon(Icons.shopping_bag_rounded), label: 'الطلبات'),
          NavigationDestination(icon: Icon(Icons.store_rounded), label: 'المتجر'),
        ],
      ),
    );
  }
}

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repository = MerchantScope.of(context);
    return FutureBuilder<MerchantDashboard>(
      future: repository.getDashboard(),
      builder: (context, snapshot) {
        final dashboard = snapshot.data;
        return _PageScaffold(
          title: 'هلا ${dashboard?.profile.storeName ?? ''}',
          subtitle: 'تابع أداء متجرك والمنتجات التي تظهر للزبائن.',
          actions: [
            IconButton.filledTonal(
              tooltip: 'خروج',
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
                        _StatTile(icon: Icons.inventory_2_rounded, label: 'المنتجات', value: '${dashboard!.products.length}'),
                        _StatTile(icon: Icons.search_rounded, label: 'البحث', value: '0'),
                        _StatTile(icon: Icons.shopping_bag_rounded, label: 'الطلبات', value: '${dashboard.orders.length}'),
                        _StatTile(icon: Icons.trending_up_rounded, label: 'اكتمال الصفحة', value: '${dashboard.completion}%'),
                      ],
                    ),
                    const SizedBox(height: 18),
                    _SectionCard(
                      title: 'آخر المنتجات',
                      child: dashboard.products.isEmpty
                          ? const _EmptyHint(text: 'لا توجد منتجات بعد. أضف أول منتج حتى يظهر للزبائن.')
                          : Column(
                              children: dashboard.products.take(4).map((product) => _ProductListTile(product: product)).toList(),
                            ),
                    ),
                    const SizedBox(height: 18),
                    _SectionCard(
                      title: 'اكتمال صفحة المتجر',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('أكمل اللوكو، الغلاف، البايو، رقم التوصيل، وأول منتج.'),
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
    final repository = MerchantScope.of(context);
    return FutureBuilder<List<MerchantProduct>>(
      future: _productsFuture,
      builder: (context, snapshot) {
        final products = (snapshot.data ?? [])
            .where((product) => '${product.title} ${product.description} ${product.color ?? ''} ${product.size ?? ''}'.contains(query))
            .toList();
        return _PageScaffold(
          title: 'المنتجات',
          subtitle: 'أضف وعدل القطع التي يبحث عنها الزبائن في بوتلي.',
          actions: [
            IconButton.filled(
              tooltip: 'إضافة منتج',
              onPressed: () => _openProductSheet(context).then((changed) {
                if (changed == true && mounted) _refreshProducts();
              }),
              icon: const Icon(Icons.add_rounded),
            ),
          ],
          child: Column(
            children: [
              TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), labelText: 'بحث'),
                onChanged: (value) => setState(() => query = value),
              ),
              const SizedBox(height: 16),
              if (snapshot.connectionState != ConnectionState.done)
                const Expanded(child: Center(child: CircularProgressIndicator()))
              else if (products.isEmpty)
                Expanded(
                  child: _EmptyHint(
                    text: 'لا توجد منتجات مطابقة. أضف منتج جديد حتى يقدر البوت يرشحه للزبائن.',
                    action: FilledButton.icon(
                      onPressed: () => _openProductSheet(context).then((changed) {
                        if (changed == true && mounted) _refreshProducts();
                      }),
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('إضافة منتج'),
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
                          if (context.mounted) _showMessage(context, 'تم حذف المنتج');
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

class OrdersScreen extends StatelessWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repository = MerchantScope.of(context);
    return FutureBuilder<List<MerchantOrder>>(
      future: repository.listOrders(),
      builder: (context, snapshot) {
        final orders = snapshot.data ?? [];
        return _PageScaffold(
          title: 'طلبات التاجر',
          subtitle: 'الطلبات التي أنشأها بوت واتساب لهذا المتجر.',
          child: snapshot.connectionState != ConnectionState.done
              ? const Center(child: CircularProgressIndicator())
              : orders.isEmpty
                  ? const _EmptyHint(text: 'لا توجد طلبات بعد.')
                  : ListView.separated(
                      itemCount: orders.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final order = orders[index];
                        return Card(
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(child: Text(order.productTitle, style: const TextStyle(fontWeight: FontWeight.w800))),
                                    Chip(label: Text(order.status == 'confirmed' ? 'مؤكد' : order.status)),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text('${numberFormat.format(order.productPrice)} ${order.currency}'),
                                Text(order.customerNumber, textDirection: ui.TextDirection.ltr),
                                Text(order.customerDetails),
                                if (order.sentToDelivery) const Text('تم إرسال الطلب للتوصيل'),
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
    final repository = MerchantScope.of(context);
    final profile = repository.profile;
    if (profile != null) _init(profile);
    return _PageScaffold(
      title: 'صفحة التاجر',
      subtitle: 'بيانات المتجر التي تظهر للزبائن وتستخدم بالبحث القريب.',
      actions: [
        IconButton.filledTonal(
          tooltip: 'معاينة',
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
                  title: const Text('صور المتجر'),
                  subtitle: const Text('رفع اللوكو والغلاف سيتم ربطه مع اختيار الصور بالخطوة القادمة.'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          TextField(controller: storeName, decoration: const InputDecoration(labelText: 'اسم المحل أو الشركة')),
          const SizedBox(height: 12),
          TextField(controller: whatsapp, keyboardType: TextInputType.phone, textDirection: ui.TextDirection.ltr, decoration: const InputDecoration(labelText: 'رقم واتساب التاجر')),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: governorates.contains(city) ? city : governorates.first,
            decoration: const InputDecoration(labelText: 'المحافظة'),
            items: governorates.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
            onChanged: (value) => setState(() => city = value ?? governorates.first),
          ),
          const SizedBox(height: 12),
          TextField(controller: bio, maxLines: 3, decoration: const InputDecoration(labelText: 'بايو المحل')),
          const SizedBox(height: 12),
          TextField(controller: address, maxLines: 3, decoration: const InputDecoration(labelText: 'عنوان المتجر أو رابط الموقع')),
          const SizedBox(height: 12),
          TextField(controller: deliveryPhone, keyboardType: TextInputType.phone, textDirection: ui.TextDirection.ltr, decoration: const InputDecoration(labelText: 'رقم التوصيل')),
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
              if (context.mounted) _showMessage(context, 'تم حفظ صفحة المتجر');
            },
            icon: const Icon(Icons.save_rounded),
            label: const Text('حفظ والمتابعة'),
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
        const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('بوتلي تاجر', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
            Text('إدارة المتجر والطلبات', style: TextStyle(color: Colors.black54)),
          ],
        ),
      ],
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
      trailing: Text('${numberFormat.format(product.customerPrice)} ${product.currency}'),
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
                Text('${numberFormat.format(product.customerPrice)} ${product.currency}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
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
  final repository = MerchantScope.of(context);
  late final MerchantCatalogue catalogue;
  try {
    catalogue = await repository.getCatalogue();
  } catch (error) {
    if (context.mounted) {
      _showMessage(context, error.toString().replaceFirst('Bad state: ', ''));
    }
    return false;
  }

  final title = TextEditingController(text: product?.title ?? '');
  final description = TextEditingController(text: product?.description ?? '');
  final price = TextEditingController(text: product == null ? '' : product.currentPrice.toStringAsFixed(0));
  final discount = TextEditingController(text: product?.discountPrice?.toStringAsFixed(0) ?? '');
  final quantity = TextEditingController(text: product?.quantity?.toString() ?? '');
  final size = TextEditingController(text: product?.size ?? '');
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
                  product == null ? 'إضافة منتج' : 'تعديل منتج',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 14),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('صور المنتج (${images.length}/$maxProductImages)', style: const TextStyle(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: images.length >= maxProductImages ? null : () => addImages(ImageSource.camera),
                                icon: const Icon(Icons.camera_alt_rounded),
                                label: const Text('الكاميرا'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: images.length >= maxProductImages ? null : () => addImages(ImageSource.gallery),
                                icon: const Icon(Icons.photo_library_rounded),
                                label: const Text('الاستوديو'),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        if (images.isEmpty)
                          const _EmptyHint(text: 'أضف صورة واحدة على الأقل، وبحد أقصى 6 صور لكل منتج.')
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
                                        child: const Padding(
                                          padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          child: Text('الرئيسية', style: TextStyle(color: Colors.white, fontSize: 10)),
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
                TextField(controller: title, decoration: const InputDecoration(labelText: 'اسم المنتج')),
                const SizedBox(height: 10),
                TextField(controller: description, maxLines: 2, decoration: const InputDecoration(labelText: 'الوصف')),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(child: TextField(controller: price, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'السعر الحالي'))),
                    const SizedBox(width: 10),
                    Expanded(child: TextField(controller: discount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'السعر النهائي'))),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(child: TextField(controller: quantity, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'الكمية'))),
                    const SizedBox(width: 10),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: catalogue.colors.contains(selectedColor) ? selectedColor : null,
                        decoration: const InputDecoration(labelText: 'اللون'),
                        items: catalogue.colors.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                        onChanged: (value) => setSheetState(() => selectedColor = value ?? ''),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(controller: size, decoration: const InputDecoration(labelText: 'الحجم/المقاس')),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: catalogue.makes.any((item) => item.label == selectedMake || item.key == selectedMake)
                      ? selectedMake
                      : null,
                  decoration: const InputDecoration(labelText: 'نوع السيارة'),
                  items: catalogue.makes.map((item) => DropdownMenuItem(value: item.label, child: Text(item.label))).toList(),
                  onChanged: (value) => setSheetState(() {
                    selectedMake = value ?? '';
                    selectedModel = '';
                  }),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: models.contains(selectedModel) ? selectedModel : null,
                  decoration: const InputDecoration(labelText: 'الموديل'),
                  items: models.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                  onChanged: selectedMake.isEmpty ? null : (value) => setSheetState(() => selectedModel = value ?? ''),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedYear.isNotEmpty && catalogue.years.contains(selectedYear) ? selectedYear : null,
                  decoration: const InputDecoration(labelText: 'سنة الصنع'),
                  items: [
                    const DropdownMenuItem(value: '', child: Text(allYearsLabel)),
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
                            _showMessage(context, 'أضف صورة واحدة على الأقل للمنتج.');
                            return;
                          }
                          if (title.text.trim().isEmpty || description.text.trim().isEmpty || parsedPrice <= 0) {
                            _showMessage(context, 'اسم المنتج والوصف والسعر مطلوبة.');
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
                                      currency: 'IQD',
                                      createdAt: DateTime.now(),
                                    ))
                                .copyWith(
                              title: title.text.trim(),
                              description: description.text.trim(),
                              imageUrl: images.first,
                              imageUrls: images,
                              currentPrice: parsedPrice,
                              discountPrice: double.tryParse(discount.text.trim()),
                              currency: 'IQD',
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
                              _showMessage(context, 'تم حفظ المنتج');
                            }
                          } catch (error) {
                            if (context.mounted) {
                              _showMessage(context, error.toString().replaceFirst('Bad state: ', ''));
                            }
                          } finally {
                            setSheetState(() => saving = false);
                          }
                        },
                  icon: saving
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.save_rounded),
                  label: const Text('حفظ المنتج'),
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
    final encoded = image.substring(image.indexOf(',') + 1);
    return MemoryImage(base64Decode(encoded));
  }
  return NetworkImage(image);
}

void _showMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
