import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/foundation.dart';

class CustomerController extends ChangeNotifier {
  final session = const SessionStore('customer');

  CustomerProfile? profile;
  CarCatalogue catalogue = const CarCatalogue(makes: [], colors: [], years: []);
  List<CustomerProduct> products = const [];
  List<CustomerOrder> orders = const [];
  bool loading = false;
  String error = '';

  Future<void> restore() async {
    final phone = await session.read('phone');
    if (phone.isEmpty) return;
    try {
      await login(phone);
    } catch (_) {
      await session.clear();
    }
  }

  Future<void> login(String whatsapp) async {
    await _run(() async {
      final result = Map<String, dynamic>.from(await customerApi.post('login', {'whatsapp': whatsapp}) as Map);
      profile = CustomerProfile.fromJson(Map<String, dynamic>.from(result['customer'] as Map));
      await session.save({'phone': profile!.whatsapp});
      await loadCatalogue();
      await refreshOrders();
    });
  }

  Future<void> signup({
    required String whatsapp,
    required String name,
    required String landmark,
    required String governorate,
  }) async {
    await _run(() async {
      final result = Map<String, dynamic>.from(await customerApi.post('signup', {
        'whatsapp': whatsapp,
        'name': name,
        'landmark': landmark,
        'governorate': governorate,
      }) as Map);
      profile = CustomerProfile.fromJson(Map<String, dynamic>.from(result['customer'] as Map));
      await session.save({'phone': profile!.whatsapp});
      await loadCatalogue();
      await refreshOrders();
    });
  }

  Future<void> loadCatalogue() async {
    final result = Map<String, dynamic>.from(await customerApi.post('catalogue', {}) as Map);
    catalogue = CarCatalogue.fromJson(result);
    notifyListeners();
  }

  Future<void> search({
    String carMake = '',
    String carModel = '',
    String carYear = '',
    String color = '',
    String governorate = '',
  }) async {
    await _run(() async {
      final list = await customerApi.postList('browseProducts', {
        'carMake': carMake,
        'carModel': carModel,
        'carYear': carYear,
        'color': color,
        'governorate': governorate,
      });
      products = list.whereType<Map>().map((item) => CustomerProduct.fromJson(Map<String, dynamic>.from(item))).toList();
    });
  }

  Future<void> submitOrder(CustomerProduct product) async {
    final current = profile;
    if (current == null) throw const ApiException('سجل دخولك أولاً.');
    await _run(() async {
      final customerName = current.name.trim().length < 2 ? 'Customer' : current.name.trim();
      final governorate = current.governorate.trim().isEmpty ? '-' : current.governorate.trim();
      final landmark = current.landmark.trim().isEmpty ? '-' : current.landmark.trim();
      await customerApi.post('submitOrder', {
        'productId': product.id,
        'customerName': customerName,
        'customerPhone': current.whatsapp,
        'customerGovernorate': governorate,
        'customerLandmark': landmark,
      });
      try {
        await refreshOrders();
      } catch (_) {
        // The order was accepted; a failed history refresh should not look like a failed order.
      }
    });
  }

  Future<void> refreshOrders() async {
    final current = profile;
    if (current == null) return;
    final list = await customerApi.postList('listOrders', {'customerPhone': current.whatsapp});
    orders = list.whereType<Map>().map((item) => CustomerOrder.fromJson(Map<String, dynamic>.from(item))).toList();
    notifyListeners();
  }

  Future<void> updateOrderStatus(CustomerOrder order, String status) async {
    final current = profile;
    if (current == null) throw const ApiException('سجل دخولك أولاً.');
    await _run(() async {
      await customerApi.post('updateOrderStatus', {
        'orderId': order.id,
        'customerPhone': current.whatsapp,
        'status': status,
      });
      await refreshOrders();
    });
  }

  Future<void> cancelOrder(CustomerOrder order) => updateOrderStatus(order, 'cancelled');

  Future<void> markOrderPurchased(CustomerOrder order) => updateOrderStatus(order, 'purchased');

  Future<void> logout() async {
    await session.clear();
    profile = null;
    products = const [];
    orders = const [];
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
