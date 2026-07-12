import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../constants/app_constants.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.details});

  final String message;
  final String? details;

  @override
  String toString() => message;
}

class MobileApi {
  const MobileApi(this.path);

  final String path;

  List<Uri> get _uris {
    final bases = <String>{apiBaseUrl, ...apiFallbackBaseUrls};
    return bases.map((base) => Uri.parse('${base.replaceAll(RegExp(r'/$'), '')}$path')).toList();
  }

  Future<dynamic> post(String action, Map<String, dynamic> data) async {
    Object? lastError;
    for (final uri in _uris) {
      try {
        final response = await http
            .post(
              uri,
              headers: const {'content-type': 'application/json; charset=utf-8'},
              body: jsonEncode({'action': action, 'data': data}),
            )
            .timeout(const Duration(seconds: 25));

        if (response.statusCode >= 300 && response.statusCode < 400) {
          lastError = 'Redirected to ${response.headers['location'] ?? 'another URL'}';
          continue;
        }

        final decoded = jsonDecode(response.body);
        if (decoded is! Map<String, dynamic>) {
          throw const ApiException('وصل رد غير صالح من الخادم. حاول مرة أخرى.');
        }
        if (response.statusCode >= 400 || decoded['ok'] != true) {
          throw ApiException(decoded['error'] is String ? decoded['error'] as String : 'تعذر تنفيذ العملية.');
        }
        return decoded['result'];
      } on ApiException {
        rethrow;
      } on FormatException catch (error) {
        throw ApiException('وصل رد غير صالح من الخادم. حاول مرة أخرى.', details: error.toString());
      } on SocketException catch (error) {
        lastError = error;
      } on HandshakeException catch (error) {
        lastError = error;
      } on http.ClientException catch (error) {
        lastError = error;
      } on TimeoutException catch (error) {
        lastError = error;
      }
    }

    throw ApiException(
      'تعذر الاتصال بالخادم. تحقق من الإنترنت أو افتح التطبيق على شبكة أخرى ثم حاول مرة ثانية.',
      details: lastError?.toString(),
    );
  }

  Future<List<dynamic>> postList(String action, Map<String, dynamic> data) async {
    final result = await post(action, data);
    if (result is Map && result['items'] is List) return result['items'] as List<dynamic>;
    return result is List ? result : const [];
  }
}

const customerApi = MobileApi('/api/customer/mobile');
const fitterApi = MobileApi('/api/fitter/mobile');
