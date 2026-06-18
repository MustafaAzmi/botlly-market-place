import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/material.dart';

import '../providers/fitter_controller.dart';

class FitterLoginScreen extends StatefulWidget {
  const FitterLoginScreen({required this.controller, super.key});

  final FitterController controller;

  @override
  State<FitterLoginScreen> createState() => _FitterLoginScreenState();
}

class _FitterLoginScreenState extends State<FitterLoginScreen> {
  final phone = TextEditingController();
  final password = TextEditingController();
  final name = TextEditingController();
  final address = TextEditingController();
  final visa = TextEditingController();
  var city = iraqiGovernorates.first;
  var signup = false;

  @override
  void dispose() {
    phone.dispose();
    password.dispose();
    name.dispose();
    address.dispose();
    visa.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    try {
      if (signup) {
        await widget.controller.signup(
          whatsapp: phone.text.trim(),
          password: password.text,
          name: name.text.trim(),
          city: city,
          address: address.text.trim(),
          visaNumber: visa.text.trim(),
        );
      } else {
        await widget.controller.login(phone.text.trim(), password.text);
      }
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final loading = widget.controller.loading;
    return PageFrame(
      title: 'دخول الفيتر',
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(signup ? 'تسجيل فيتر جديد' : 'دخول الفيتر', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          const Text('واجهة عملية لمتابعة الطلبيات والعمولات بسرعة.'),
          const SizedBox(height: 18),
          TextField(controller: phone, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'رقم الواتساب')),
          const SizedBox(height: 10),
          TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'كلمة المرور')),
          if (signup) ...[
            const SizedBox(height: 10),
            TextField(controller: name, decoration: const InputDecoration(labelText: 'الاسم')),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: city,
              decoration: const InputDecoration(labelText: 'المحافظة'),
              items: iraqiGovernorates.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
              onChanged: (value) => setState(() => city = value ?? city),
            ),
            const SizedBox(height: 10),
            TextField(controller: address, decoration: const InputDecoration(labelText: 'العنوان')),
            const SizedBox(height: 10),
            TextField(controller: visa, decoration: const InputDecoration(labelText: 'رقم الفيزا / الحساب')),
          ],
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: loading ? null : submit,
            icon: loading ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.login),
            label: Text(signup ? 'إنشاء الحساب' : 'دخول'),
          ),
          TextButton(onPressed: loading ? null : () => setState(() => signup = !signup), child: Text(signup ? 'عندي حساب' : 'تسجيل فيتر جديد')),
        ],
      ),
    );
  }
}
