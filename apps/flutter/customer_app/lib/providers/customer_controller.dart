import 'dart:async';

import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/foundation.dart';

class CustomerController extends ChangeNotifier {
  static const _pollInterval = Duration(seconds: 10);

  final session = const SessionStore('customer');

  CustomerProfile? profile;
  CarCatalogue catalogue = const CarCatalogue(makes: [], colors: [], years: []);
  List<CustomerProduct> products = const [];
  List<CustomerOrder> orders = const [];
  bool loading = false;
  String error = '';
  Timer? _ordersTimer;
  var _ordersSnapshotReady = false;
  final _orderSignatures = <String, String>{};

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
      await refreshOrders(notifyChanges: false);
      startOrderUpdates();
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
      await refreshOrders(notifyChanges: false);
      startOrderUpdates();
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
        await refreshOrders(notifyChanges: false);
      } catch (_) {
        // The order was accepted; a failed history refresh should not look like a failed order.
      }
    });
  }

  Future<void> submitSmartRequest({
    required String productName,
    required String description,
    required String carMake,
    required String carModel,
    required String specialty,
    required String governorate,
  }) async {
    final current = profile;
    if (current == null) throw const ApiException('سجل دخولك أولاً.');
    await _run(() async {
      final result = Map<String, dynamic>.from(await customerApi.post('submitSmartRequest', {
        'productName': productName.trim().isEmpty ? description.trim() : productName.trim(),
        'requestDetails': description.trim(),
        'carMake': carMake,
        'carModel': carModel,
        'specialty': specialty,
        'governorate': governorate,
        'requesterType': 'customer',
        'requesterName': current.name.trim().isEmpty ? 'زبون' : current.name.trim(),
        'requesterPhone': current.whatsapp,
        'searchScope': 'governorate',
      }) as Map);
      if ((result['targetMerchantCount'] as num? ?? 0).toInt() == 0) {
        throw ApiException('لا يتوفر تاجر لبيع قطع $carModel في الوقت الحالي، حاول في محافظة أخرى.');
      }
      await refreshOrders(notifyChanges: false);
    });
  }

  void startOrderUpdates() {
    _ordersTimer?.cancel();
    _ordersTimer = Timer.periodic(_pollInterval, (_) {
      unawaited(refreshOrders().catchError((_) {}));
    });
  }

  Future<void> refreshOrders({bool notifyChanges = true}) async {
    final current = profile;
    if (current == null) return;
    final list = await customerApi.postList('listOrders', {'customerPhone': current.whatsapp});
    final nextOrders = list.whereType<Map>().map((item) => CustomerOrder.fromJson(Map<String, dynamic>.from(item))).toList();
    if (notifyChanges) _notifyChangedOrders(nextOrders);
    orders = nextOrders;
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
      await refreshOrders(notifyChanges: false);
    });
  }

  Future<void> cancelOrder(CustomerOrder order) => updateOrderStatus(order, 'cancelled');

  Future<void> markOrderPurchased(CustomerOrder order) => updateOrderStatus(order, 'purchased');

  Future<void> logout() async {
    _ordersTimer?.cancel();
    _ordersTimer = null;
    _ordersSnapshotReady = false;
    _orderSignatures.clear();
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

  void _notifyChangedOrders(List<CustomerOrder> nextOrders) {
    final nextSignatures = {
      for (final order in nextOrders) order.id: _signature(order),
    };
    if (!_ordersSnapshotReady) {
      _orderSignatures
        ..clear()
        ..addAll(nextSignatures);
      _ordersSnapshotReady = true;
      return;
    }

    CustomerOrder? changed;
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

    unawaited(MobileNotificationService.instance.show(
      title: 'Botlly',
      body: 'تم تحديث طلبك: ${changed.productTitle}',
      id: changed.id.hashCode & 0x7fffffff,
    ));
  }

  String _signature(CustomerOrder order) {
    return [
      order.status,
      order.merchantStatus,
      order.requesterStatus,
      order.finalStatus,
      order.price.toStringAsFixed(2),
      order.currency,
      order.merchantStoreName,
      order.merchantWhatsapp,
      order.merchantNote,
      order.updatedAt,
    ].join('|');
  }

  @override
  void dispose() {
    _ordersTimer?.cancel();
    super.dispose();
  }
}
