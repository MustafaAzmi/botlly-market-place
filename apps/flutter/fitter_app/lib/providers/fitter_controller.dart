import 'dart:async';

import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/foundation.dart';

class FitterController extends ChangeNotifier {
  static const _pollInterval = Duration(seconds: 10);

  final session = const SessionStore('fitter');

  FitterProfile? profile;
  FitterSummary? summary;
  CarCatalogue catalogue = const CarCatalogue(makes: [], colors: [], years: []);
  List<CustomerProduct> products = const [];
  bool loading = false;
  String error = '';
  Timer? _summaryTimer;
  var _ordersSnapshotReady = false;
  final _orderSignatures = <String, String>{};

  Future<void> restore() async {
    final token = await session.read('token');
    if (token.isEmpty) return;
    try {
      await refreshSummary(notifyChanges: false);
      await loadCatalogue();
      startOrderUpdates();
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
      await refreshSummary(notifyChanges: false);
      await loadCatalogue();
      startOrderUpdates();
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
      await refreshSummary(notifyChanges: false);
      await loadCatalogue();
      startOrderUpdates();
    });
  }

  void startOrderUpdates() {
    _summaryTimer?.cancel();
    _summaryTimer = Timer.periodic(_pollInterval, (_) {
      unawaited(refreshSummary().catchError((_) {}));
    });
  }

  Future<void> refreshSummary({bool notifyChanges = true}) async {
    final token = await session.read('token');
    if (token.isEmpty) return;
    final result = Map<String, dynamic>.from(await fitterApi.post('summary', {'token': token}) as Map);
    final nextSummary = FitterSummary.fromJson(result);
    if (notifyChanges) _notifyChangedOrders(nextSummary.orders);
    summary = nextSummary;
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
      await refreshSummary(notifyChanges: false);
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
    final token = await session.read('token');
    if (token.isEmpty) throw const ApiException('سجل دخولك أولاً.');
    await _run(() async {
      final result = Map<String, dynamic>.from(await fitterApi.post('submitSmartRequest', {
        'token': token,
        'productName': productName.trim().isEmpty ? description.trim() : productName.trim(),
        'requestDetails': description.trim(),
        'carMake': carMake,
        'carModel': carModel,
        'specialty': specialty,
        'governorate': governorate,
      }) as Map);
      if ((result['targetMerchantCount'] as num? ?? 0).toInt() == 0) {
        throw ApiException('لا يتوفر تاجر لبيع قطع $carModel في الوقت الحالي، حاول في محافظة أخرى.');
      }
      await refreshSummary(notifyChanges: false);
    });
  }

  Future<void> confirmOrder(FitterOrder order) async {
    final token = await session.read('token');
    await _run(() async {
      await fitterApi.post('confirmWebPurchase', {'token': token, 'orderId': order.id});
      await refreshSummary(notifyChanges: false);
    });
  }

  Future<void> cancelOrder(FitterOrder order) async {
    final token = await session.read('token');
    await _run(() async {
      await fitterApi.post('cancelWebPurchase', {'token': token, 'orderId': order.id});
      await refreshSummary(notifyChanges: false);
    });
  }

  Future<void> logout() async {
    _summaryTimer?.cancel();
    _summaryTimer = null;
    _ordersSnapshotReady = false;
    _orderSignatures.clear();
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

  void _notifyChangedOrders(List<FitterOrder> nextOrders) {
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

    FitterOrder? changed;
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
      title: 'Botlly Fitter',
      body: 'تم تحديث طلبك: ${changed.productTitle}',
      id: changed.id.hashCode & 0x7fffffff,
    ));
  }

  String _signature(FitterOrder order) {
    return [
      order.status,
      order.merchantStatus,
      order.requesterStatus,
      order.finalStatus,
      order.productPrice.toStringAsFixed(2),
      order.currency,
      order.merchantStoreName,
      order.merchantWhatsapp,
    ].join('|');
  }

  @override
  void dispose() {
    _summaryTimer?.cancel();
    super.dispose();
  }
}
