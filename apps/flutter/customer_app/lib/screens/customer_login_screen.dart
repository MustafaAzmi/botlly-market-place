import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/material.dart';

import '../providers/customer_controller.dart';

class CustomerLoginScreen extends StatefulWidget {
  const CustomerLoginScreen({required this.controller, super.key});

  final CustomerController controller;

  @override
  State<CustomerLoginScreen> createState() => _CustomerLoginScreenState();
}

class _CustomerLoginScreenState extends State<CustomerLoginScreen> {
  final phone = TextEditingController();
  final name = TextEditingController();
  final landmark = TextEditingController();
  var governorate = iraqiGovernorates.first;
  var signup = false;

  @override
  void dispose() {
    phone.dispose();
    name.dispose();
    landmark.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    try {
      if (signup) {
        await widget.controller.signup(
          whatsapp: phone.text.trim(),
          name: name.text.trim(),
          landmark: landmark.text.trim(),
          governorate: governorate,
        );
      } else {
        await widget.controller.login(phone.text.trim());
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final loading = widget.controller.loading;
    return PageFrame(
      title: 'Botlly',
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SizedBox(height: 24),
          Text(
            signup ? 'إنشاء حساب زبون' : 'دخول الزبون',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          const Text('استخدم رقم واتسابك حتى نتابع طلباتك ونوصل الردود بوضوح.'),
          const SizedBox(height: 20),
          TextField(
            controller: phone,
            keyboardType: TextInputType.phone,
            textDirection: TextDirection.ltr,
            decoration: const InputDecoration(labelText: 'رقم الواتساب'),
          ),
          if (signup) ...[
            const SizedBox(height: 12),
            TextField(controller: name, decoration: const InputDecoration(labelText: 'الاسم')),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: governorate,
              decoration: const InputDecoration(labelText: 'المحافظة'),
              items: iraqiGovernorates.map((city) => DropdownMenuItem(value: city, child: Text(city))).toList(),
              onChanged: (value) => setState(() => governorate = value ?? governorate),
            ),
            const SizedBox(height: 12),
            TextField(controller: landmark, decoration: const InputDecoration(labelText: 'أقرب نقطة دالة')),
          ],
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: loading ? null : submit,
            icon: loading
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.login),
            label: Text(signup ? 'إنشاء الحساب' : 'دخول'),
          ),
          TextButton(
            onPressed: loading ? null : () => setState(() => signup = !signup),
            child: Text(signup ? 'عندي حساب سابق' : 'تسجيل زبون جديد'),
          ),
        ],
      ),
    );
  }
}
