import 'package:shared_preferences/shared_preferences.dart';

class SessionStore {
  const SessionStore(this.prefix);

  final String prefix;

  Future<void> save(Map<String, String> values) async {
    final prefs = await SharedPreferences.getInstance();
    for (final entry in values.entries) {
      await prefs.setString('$prefix.${entry.key}', entry.value);
    }
  }

  Future<String> read(String key) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('$prefix.$key') ?? '';
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys().where((key) => key.startsWith('$prefix.'));
    for (final key in keys) {
      await prefs.remove(key);
    }
  }
}
