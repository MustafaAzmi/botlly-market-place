String readString(Map<String, dynamic> json, String key, [String fallback = '']) {
  final value = json[key];
  return value is String ? value : fallback;
}

double readDouble(Map<String, dynamic> json, String key, [double fallback = 0]) {
  final value = json[key];
  if (value is num) return value.toDouble();
  return fallback;
}

int readInt(Map<String, dynamic> json, String key, [int fallback = 0]) {
  final value = json[key];
  if (value is num) return value.toInt();
  return fallback;
}

List<String> readStringList(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is List) {
    return value.whereType<String>().where((item) => item.isNotEmpty).toList();
  }
  return const [];
}

class CustomerProfile {
  const CustomerProfile({
    required this.id,
    required this.whatsapp,
    required this.name,
    required this.landmark,
    required this.governorate,
  });

  final String id;
  final String whatsapp;
  final String name;
  final String landmark;
  final String governorate;

  factory CustomerProfile.fromJson(Map<String, dynamic> json) => CustomerProfile(
        id: readString(json, 'id'),
        whatsapp: readString(json, 'whatsapp'),
        name: readString(json, 'name'),
        landmark: readString(json, 'landmark'),
        governorate: readString(json, 'governorate'),
      );
}

class CustomerProduct {
  const CustomerProduct({
    required this.id,
    required this.title,
    required this.description,
    required this.imageUrls,
    required this.price,
    required this.currency,
    this.originalPrice,
    this.color,
    this.size,
    this.carMake,
    this.carModel,
    this.carYear,
    this.merchantGovernorate,
    this.deliveryEstimate,
    this.quantity,
  });

  final String id;
  final String title;
  final String description;
  final List<String> imageUrls;
  final double price;
  final double? originalPrice;
  final String currency;
  final String? color;
  final String? size;
  final String? carMake;
  final String? carModel;
  final String? carYear;
  final String? merchantGovernorate;
  final String? deliveryEstimate;
  final int? quantity;

  factory CustomerProduct.fromJson(Map<String, dynamic> json) => CustomerProduct(
        id: readString(json, 'id'),
        title: readString(json, 'title', readString(json, 'description', 'منتج')),
        description: readString(json, 'description'),
        imageUrls: readStringList(json, 'imageUrls'),
        price: readDouble(json, 'price'),
        originalPrice: json['originalPrice'] is num ? (json['originalPrice'] as num).toDouble() : null,
        currency: readString(json, 'currency', 'IQD'),
        color: readString(json, 'color').isEmpty ? null : readString(json, 'color'),
        size: readString(json, 'size').isEmpty ? null : readString(json, 'size'),
        carMake: readString(json, 'carMake').isEmpty ? null : readString(json, 'carMake'),
        carModel: readString(json, 'carModel').isEmpty ? null : readString(json, 'carModel'),
        carYear: readString(json, 'carYear').isEmpty ? null : readString(json, 'carYear'),
        merchantGovernorate:
            readString(json, 'merchantGovernorate').isEmpty ? null : readString(json, 'merchantGovernorate'),
        deliveryEstimate:
            readString(json, 'deliveryEstimate').isEmpty ? null : readString(json, 'deliveryEstimate'),
        quantity: json['quantity'] is num ? (json['quantity'] as num).toInt() : null,
      );
}

class CustomerOrder {
  const CustomerOrder({
    required this.id,
    required this.productTitle,
    required this.status,
    required this.merchantStatus,
    required this.requesterStatus,
    required this.finalStatus,
    required this.currency,
    required this.price,
    required this.updatedAt,
  });

  final String id;
  final String productTitle;
  final String status;
  final String merchantStatus;
  final String requesterStatus;
  final String finalStatus;
  final String currency;
  final double price;
  final String updatedAt;

  bool get canRequesterAct =>
      (merchantStatus == 'Available' || merchantStatus == 'Sold') && requesterStatus == 'Pending';

  factory CustomerOrder.fromJson(Map<String, dynamic> json) => CustomerOrder(
        id: readString(json, 'id'),
        productTitle: readString(json, 'productTitle', 'طلب'),
        status: readString(json, 'status', 'requested'),
        merchantStatus: readString(json, 'merchantStatus', 'Pending'),
        requesterStatus: readString(json, 'requesterStatus', 'Pending'),
        finalStatus: readString(json, 'finalStatus', readString(json, 'status', 'requested')),
        currency: readString(json, 'currency', 'IQD'),
        price: readDouble(json, 'price'),
        updatedAt: readString(json, 'updatedAt'),
      );
}

class CarMakeOption {
  const CarMakeOption({required this.key, required this.label, required this.models});

  final String key;
  final String label;
  final List<String> models;

  factory CarMakeOption.fromJson(Map<String, dynamic> json) => CarMakeOption(
        key: readString(json, 'key'),
        label: readString(json, 'label'),
        models: readStringList(json, 'models'),
      );
}

class CarCatalogue {
  const CarCatalogue({required this.makes, required this.colors, required this.years});

  final List<CarMakeOption> makes;
  final List<String> colors;
  final List<String> years;

  factory CarCatalogue.fromJson(Map<String, dynamic> json) => CarCatalogue(
        makes: (json['makes'] is List ? json['makes'] as List : const [])
            .whereType<Map>()
            .map((item) => CarMakeOption.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        colors: readStringList(json, 'colors'),
        years: readStringList(json, 'years'),
      );
}

class FitterProfile {
  const FitterProfile({
    required this.id,
    required this.whatsapp,
    required this.name,
    required this.city,
    required this.address,
    required this.visaNumber,
    required this.commissionPercent,
  });

  final String id;
  final String whatsapp;
  final String name;
  final String city;
  final String address;
  final String visaNumber;
  final double commissionPercent;

  factory FitterProfile.fromJson(Map<String, dynamic> json) => FitterProfile(
        id: readString(json, 'id'),
        whatsapp: readString(json, 'whatsapp'),
        name: readString(json, 'name', 'فيتر'),
        city: readString(json, 'city'),
        address: readString(json, 'address'),
        visaNumber: readString(json, 'visaNumber'),
        commissionPercent: readDouble(json, 'commissionPercent'),
      );
}

class FitterOrder {
  const FitterOrder({
    required this.id,
    required this.productTitle,
    required this.productPrice,
    required this.currency,
    required this.merchantStoreName,
    required this.merchantWhatsapp,
    required this.merchantAddress,
    required this.merchantGovernorate,
    required this.commissionAmount,
    required this.status,
    required this.merchantStatus,
    required this.requesterStatus,
    required this.finalStatus,
  });

  final String id;
  final String productTitle;
  final double productPrice;
  final String currency;
  final String merchantStoreName;
  final String merchantWhatsapp;
  final String merchantAddress;
  final String merchantGovernorate;
  final double commissionAmount;
  final String status;
  final String merchantStatus;
  final String requesterStatus;
  final String finalStatus;

  bool get canRequesterAct =>
      (merchantStatus == 'Available' || merchantStatus == 'Sold') && requesterStatus == 'Pending';

  factory FitterOrder.fromJson(Map<String, dynamic> json) => FitterOrder(
        id: readString(json, 'id'),
        productTitle: readString(json, 'productTitle', 'طلبية'),
        productPrice: readDouble(json, 'productPrice'),
        currency: readString(json, 'currency', 'IQD'),
        merchantStoreName: readString(json, 'merchantStoreName'),
        merchantWhatsapp: readString(json, 'merchantWhatsapp'),
        merchantAddress: readString(json, 'merchantAddress'),
        merchantGovernorate: readString(json, 'merchantGovernorate'),
        commissionAmount: readDouble(json, 'commissionAmount'),
        status: readString(json, 'status', 'requested'),
        merchantStatus: readString(json, 'merchantStatus', 'Pending'),
        requesterStatus: readString(json, 'requesterStatus', 'Pending'),
        finalStatus: readString(json, 'finalStatus', readString(json, 'status', 'requested')),
      );
}

class FitterSummary {
  const FitterSummary({
    required this.fitter,
    required this.totalProfit,
    required this.currency,
    required this.salesCount,
    required this.orders,
  });

  final FitterProfile fitter;
  final double totalProfit;
  final String currency;
  final int salesCount;
  final List<FitterOrder> orders;

  factory FitterSummary.fromJson(Map<String, dynamic> json) => FitterSummary(
        fitter: FitterProfile.fromJson(Map<String, dynamic>.from(json['fitter'] as Map? ?? const {})),
        totalProfit: readDouble(json, 'totalProfit'),
        currency: readString(json, 'currency', 'IQD'),
        salesCount: readInt(json, 'salesCount'),
        orders: (json['orders'] is List ? json['orders'] as List : const [])
            .whereType<Map>()
            .map((item) => FitterOrder.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
      );
}
