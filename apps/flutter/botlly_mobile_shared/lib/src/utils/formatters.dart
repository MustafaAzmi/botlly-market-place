import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

String money(num value, String currency) {
  final formatted = NumberFormat.decimalPattern('ar').format(value);
  return '$formatted $currency';
}

String readableStatus(String status) {
  return switch (status) {
    'confirmed' => 'مؤكد',
    'cancelled' => 'ملغي',
    'purchased' => 'تم الشراء',
    'completed' => 'مكتملة',
    'pending_review' => 'قيد المراجعة',
    'available' => 'المنتج متوفر',
    'unavailable' => 'المنتج غير متوفر',
    'Available' => 'المنتج متوفر',
    'Unavailable' => 'المنتج غير متوفر',
    'Sold' => 'بانتظار تأكيد الزبون',
    'Cancelled' => 'ملغي',
    'Purchased' => 'تم الشراء',
    'Pending' => 'قيد المتابعة',
    'out_of_stock' => 'غير متوفر',
    'merchant_confirm_order' => 'متوفر',
    'merchant_product_out_of_stock' => 'غير متوفر',
    _ => 'قيد المتابعة',
  };
}

Future<bool> openExternal(String value) async {
  final uri = Uri.tryParse(value);
  if (uri == null) return false;
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}

Future<bool> openWhatsApp(String phone, [String message = '']) {
  final cleaned = phone.replaceAll(RegExp(r'[^\d+]'), '');
  final uri = Uri.parse('https://wa.me/${cleaned.replaceFirst('+', '')}?text=${Uri.encodeComponent(message)}');
  return openExternal(uri.toString());
}

Future<bool> callPhone(String phone) => openExternal('tel:$phone');
