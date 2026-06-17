import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
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
    return _withoutEmpty({
      'token': token,
      if (productId != null) 'productId': productId,
      'title': title,
      'description': description,
      'imageUrl': imageUrl.isEmpty ? placeholderImage : imageUrl,
      'imageUrls': [imageUrl.isEmpty ? placeholderImage : imageUrl],
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
    double? currentPrice,
    double? discountPrice,
    String? currency,
    int? quantity,
    String? color,
    String? size,
    String? carMake,
    String? carModel,
    String? carYear,
  }) {
    return MerchantProduct(
      id: id,
      title: title ?? this.title,
      description: description ?? this.description,
      imageUrl: imageUrl ?? this.imageUrl,
      currentPrice: currentPrice ?? this.currentPrice,
      discountPrice: discountPrice ?? this.discountPrice,
      currency: currency ?? this.currency,
      quantity: quantity ?? this.quantity,
      color: color ?? this.color,
      size: size ?? this.size,
      carMake: carMake ?? this.carMake,
      carModel: carModel ?? this.carModel,
      carYear: carYear ?? this.carYear,
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

class MerchantRepository extends ChangeNotifier {
  MerchantProfile? _profile;
  String? _token;
  final _products = <MerchantProduct>[];
  final _orders = <MerchantOrder>[];

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
    return MerchantDashboard(
      profile: _profile!,
      products: List.unmodifiable(_products),
      orders: List.unmodifiable(_orders),
    );
  }

  Future<List<MerchantProduct>> listProducts() async {
    _requireSession();
    final rows = await _postList('listProducts', {'token': _token});
    _products
      ..clear()
      ..addAll(rows.map((item) => MerchantProduct.fromJson(_map(item))));
    return List.unmodifiable(_products);
  }

  Future<List<MerchantOrder>> listOrders() async {
    _requireSession();
    final rows = await _postList('listOrders', {'token': _token});
    _orders
      ..clear()
      ..addAll(rows.map((item) => MerchantOrder.fromJson(_map(item))));
    return List.unmodifiable(_orders);
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
    notifyListeners();
  }

  Future<void> deleteProduct(String id) async {
    _requireSession();
    await _post('deleteProduct', {'token': _token, 'productId': id});
    _products.removeWhere((item) => item.id == id);
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

  @override
  Widget build(BuildContext context) {
    final repository = MerchantScope.of(context);
    return FutureBuilder<List<MerchantProduct>>(
      future: repository.listProducts(),
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
              onPressed: () => _openProductSheet(context),
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
                      onPressed: () => _openProductSheet(context),
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
                        onEdit: () => _openProductSheet(context, product: product),
                        onDelete: () async {
                          await repository.deleteProduct(product.id);
                          if (context.mounted) _showMessage(context, 'تم حذف المنتج');
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
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: const Color(0xffdcfce7),
                  child: Icon(Icons.directions_car_rounded, color: Theme.of(context).colorScheme.primary),
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

Future<void> _openProductSheet(BuildContext context, {MerchantProduct? product}) async {
  final repository = MerchantScope.of(context);
  final title = TextEditingController(text: product?.title ?? '');
  final description = TextEditingController(text: product?.description ?? '');
  final price = TextEditingController(text: product == null ? '' : product.currentPrice.toStringAsFixed(0));
  final discount = TextEditingController(text: product?.discountPrice?.toStringAsFixed(0) ?? '');
  final quantity = TextEditingController(text: product?.quantity?.toString() ?? '');
  final color = TextEditingController(text: product?.color ?? '');
  final size = TextEditingController(text: product?.size ?? '');
  final carMake = TextEditingController(text: product?.carMake ?? '');
  final carModel = TextEditingController(text: product?.carModel ?? '');
  final carYear = TextEditingController(text: product?.carYear ?? '');

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) {
      return Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 16),
        child: ListView(
          shrinkWrap: true,
          children: [
            Text(product == null ? 'إضافة منتج' : 'تعديل منتج', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 14),
            TextField(controller: title, decoration: const InputDecoration(labelText: 'اسم المنتج')),
            const SizedBox(height: 10),
            TextField(controller: description, maxLines: 2, decoration: const InputDecoration(labelText: 'الوصف')),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: TextField(controller: price, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'السعر النهائي'))),
                const SizedBox(width: 10),
                Expanded(child: TextField(controller: discount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'سعر التخفيض'))),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: TextField(controller: quantity, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'الكمية'))),
                const SizedBox(width: 10),
                Expanded(child: TextField(controller: color, decoration: const InputDecoration(labelText: 'اللون'))),
              ],
            ),
            const SizedBox(height: 10),
            TextField(controller: size, decoration: const InputDecoration(labelText: 'الحجم/المقاس')),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: TextField(controller: carMake, decoration: const InputDecoration(labelText: 'الشركة'))),
                const SizedBox(width: 10),
                Expanded(child: TextField(controller: carModel, decoration: const InputDecoration(labelText: 'الموديل'))),
              ],
            ),
            const SizedBox(height: 10),
            TextField(controller: carYear, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'السنة')),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () async {
                final parsedPrice = double.tryParse(price.text.trim()) ?? 0;
                if (title.text.trim().isEmpty || description.text.trim().isEmpty || parsedPrice <= 0) {
                  _showMessage(context, 'اسم المنتج والوصف والسعر مطلوبة.');
                  return;
                }
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
                  currentPrice: parsedPrice,
                  discountPrice: double.tryParse(discount.text.trim()),
                  currency: 'IQD',
                  quantity: int.tryParse(quantity.text.trim()),
                  color: color.text.trim(),
                  size: size.text.trim(),
                  carMake: carMake.text.trim(),
                  carModel: carModel.text.trim(),
                  carYear: carYear.text.trim(),
                );
                await repository.saveProduct(next);
                if (context.mounted) {
                  Navigator.pop(context);
                  _showMessage(context, 'تم حفظ المنتج');
                }
              },
              icon: const Icon(Icons.save_rounded),
              label: const Text('حفظ المنتج'),
            ),
          ],
        ),
      );
    },
  );
}

void _showMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
