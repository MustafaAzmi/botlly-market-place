import 'dart:convert';

import 'package:http/http.dart' as http;

import '../constants/app_constants.dart';

class ApiException implements Exception {
  const ApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class MobileApi {
  const MobileApi(this.path);

  final String path;

  Uri get _uri => Uri.parse('${apiBaseUrl.replaceAll(RegExp(r'/$'), '')}$path');

  Future<dynamic> post(String action, Map<String, dynamic> data) async {
    final response = await http.post(
      _uri,
      headers: const {'content-type': 'application/json; charset=utf-8'},
      body: jsonEncode({'action': action, 'data': data}),
    );
    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400 || decoded['ok'] != true) {
      throw ApiException(decoded['error'] is String ? decoded['error'] as String : 'تعذر تنفيذ العملية.');
    }
    return decoded['result'];
  }

  Future<List<dynamic>> postList(String action, Map<String, dynamic> data) async {
    final result = await post(action, data);
    return result is List ? result : const [];
  }
}

const customerApi = MobileApi('/api/customer/mobile');
const fitterApi = MobileApi('/api/fitter/mobile');
