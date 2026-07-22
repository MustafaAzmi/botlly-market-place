import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/material.dart';

import '../providers/customer_controller.dart';
import 'customer_orders_screen.dart';

class CustomerHomeScreen extends StatefulWidget {
  const CustomerHomeScreen({required this.controller, super.key});

  final CustomerController controller;

  @override
  State<CustomerHomeScreen> createState() => _CustomerHomeScreenState();
}

class _CustomerHomeScreenState extends State<CustomerHomeScreen> {
  final description = TextEditingController();
  String governorate = '';
  String make = '';
  String model = '';
  String specialty = '';

  static const specialties = <String>[
    'كهربائيات عامة',
    'إكسسوارات',
    'محرك',
    'هيكل وبدن',
    'تعليق وتوجيه',
    'فرامل',
    'تبريد وتكييف',
    'أخرى',
  ];

  @override
  void initState() {
    super.initState();
    if (widget.controller.catalogue.makes.isEmpty) {
      widget.controller.loadCatalogue();
    }
  }

  @override
  void dispose() {
    description.dispose();
    super.dispose();
  }

  bool get canSubmit =>
      governorate.isNotEmpty &&
      make.isNotEmpty &&
      model.isNotEmpty &&
      specialty.isNotEmpty &&
      description.text.trim().isNotEmpty;

  Future<void> submitRequest() async {
    if (!canSubmit) return;
    await widget.controller.submitSmartRequest(
      productName: description.text,
      description: description.text,
      carMake: make,
      carModel: model,
      specialty: specialty,
      governorate: governorate,
    );
    if (!mounted) return;
    description.clear();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('تم إرسال الطلب للتجار المختصين')),
    );
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final selectedMake = c.catalogue.makes.firstWhere(
      (item) => item.label == make,
      orElse: () => const CarMakeOption(key: '', label: '', models: []),
    );
    return PageFrame(
      title: 'Botlly',
      actions: [
        IconButton(
          tooltip: 'الإشعارات والطلبات',
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => CustomerOrdersScreen(controller: c)),
          ),
          icon: const Icon(Icons.notifications_active_outlined),
        ),
        IconButton(onPressed: c.logout, icon: const Icon(Icons.logout)),
      ],
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Text('أهلاً ${c.profile?.name ?? ''}', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'البحث الذكي',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  const Text('اكتب وصف المنتج وسيتم إرسال الطلب للتجار المختصين حسب المحافظة ونوع السيارة والموديل والاختصاص.'),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: governorate.isEmpty ? null : governorate,
                    decoration: const InputDecoration(labelText: 'المحافظة'),
                    items: iraqiGovernorates.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                    onChanged: (value) => setState(() => governorate = value ?? ''),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: make.isEmpty ? null : make,
                    decoration: const InputDecoration(labelText: 'نوع السيارة'),
                    items: c.catalogue.makes.map((item) => DropdownMenuItem(value: item.label, child: Text(item.label))).toList(),
                    onChanged: (value) => setState(() {
                      make = value ?? '';
                      model = '';
                    }),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: model.isEmpty ? null : model,
                    decoration: const InputDecoration(labelText: 'الموديل'),
                    items: selectedMake.models.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                    onChanged: make.isEmpty ? null : (value) => setState(() => model = value ?? ''),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: specialty.isEmpty ? null : specialty,
                    decoration: const InputDecoration(labelText: 'الاختصاص'),
                    items: specialties.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                    onChanged: (value) => setState(() => specialty = value ?? ''),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: description,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: 'وصف المنتج'),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: c.loading || !canSubmit ? null : submitRequest,
                    icon: const Icon(Icons.send_rounded),
                    label: const Text('إرسال الطلب للتجار المختصين'),
                  ),
                ],
              ),
            ),
          ),
          if (c.error.isNotEmpty) ...[
            const SizedBox(height: 12),
            ErrorNotice(message: c.error, onRetry: submitRequest),
          ],
          if (c.loading) const SizedBox(height: 220, child: LoadingView()),
        ],
      ),
    );
  }
}
