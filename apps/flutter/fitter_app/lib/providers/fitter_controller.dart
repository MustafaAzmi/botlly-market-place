import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/foundation.dart';

class FitterController extends ChangeNotifier {
  final session = const SessionStore('fitter');

  FitterProfile? profile;
  FitterSummary? summary;
  CarCatalogue catalogue = const CarCatalogue(makes: [], colors: [], years: []);
  List<CustomerProduct> products = const [];
  bool loading = false;
  String error = '';

  Future<void> restore() async {
    final token = await session.read('token');
    if (token.isEmpty) return;
    try {
      await refreshSummary();
      await loadCatalogue();
    } catch (_) {
      await session.clear();
    }
  }

  Future<void> login(String whatsapp, String password) async {
    await _run(() async {
      final result = Map<String, dynamic>.from(await fitterApi.post('login', {
        'whatsapp': whatsapp,
        'password': password,
      }) as Map);
      profile = FitterProfile.fromJson(Map<String, dynamic>.from(result['fitter'] as Map));
      await session.save({'token': result['token'] as String, 'phone': profile!.whatsapp});
      await refreshSummary();
      await loadCatalogue();
    });
  }

  Future<void> signup({
    required String whatsapp,
    required String password,
    required String name,
    required String city,
    required String address,
    required String visaNumber,
  }) async {
    await _run(() async {
      final result = Map<String, dynamic>.from(await fitterApi.post('signup', {
        'whatsapp': whatsapp,
        'password': password,
        'name': name,
        'city': city,
        'address': address,
        'visaNumber': visaNumber,
      }) as Map);
      profile = FitterProfile.fromJson(Map<String, dynamic>.from(result['fitter'] as Map));
      await session.save({'token': result['token'] as String, 'phone': profile!.whatsapp});
      await refreshSummary();
      await loadCatalogue();
    });
  }

  Future<void> refreshSummary() async {
    final token = await session.read('token');
    if (token.isEmpty) return;
    final result = Map<String, dynamic>.from(await fitterApi.post('summary', {'token': token}) as Map);
    summary = FitterSummary.fromJson(result);
    profile = summary!.fitter;
    notifyListeners();
  }

  Future<void> loadCatalogue() async {
    final result = Map<String, dynamic>.from(await fitterApi.post('catalogue', {}) as Map);
    catalogue = CarCatalogue.fromJson(result);
    notifyListeners();
  }

  Future<void> search({String carMake = '', String carModel = '', String carYear = '', String color = '', String governorate = ''}) async {
    await _run(() async {
      final list = await fitterApi.postList('browseProducts', {
        'carMake': carMake,
        'carModel': carModel,
        'carYear': carYear,
        'color': color,
        'governorate': governorate,
      });
      products = list.whereType<Map>().map((item) => CustomerProduct.fromJson(Map<String, dynamic>.from(item))).toList();
    });
  }

  Future<void> requestProduct(CustomerProduct product) async {
    final token = await session.read('token');
    await _run(() async {
      await fitterApi.post('requestProduct', {'token': token, 'productId': product.id});
      await refreshSummary();
    });
  }

  Future<void> confirmOrder(FitterOrder order) async {
    final token = await session.read('token');
    await _run(() async {
      await fitterApi.post('confirmWebPurchase', {'token': token, 'orderId': order.id});
      await refreshSummary();
    });
  }

  Future<void> cancelOrder(FitterOrder order) async {
    final token = await session.read('token');
    await _run(() async {
      await fitterApi.post('cancelWebPurchase', {'token': token, 'orderId': order.id});
      await refreshSummary();
    });
  }

  Future<void> logout() async {
    await session.clear();
    profile = null;
    summary = null;
    products = const [];
    notifyListeners();
  }

  Future<void> _run(Future<void> Function() task) async {
    loading = true;
    error = '';
    notifyListeners();
    try {
      await task();
    } catch (exception) {
      error = exception.toString();
      rethrow;
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
