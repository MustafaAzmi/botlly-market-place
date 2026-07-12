import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/material.dart';

import '../providers/customer_controller.dart';
import 'customer_orders_screen.dart';
import 'product_details_screen.dart';

class CustomerHomeScreen extends StatefulWidget {
  const CustomerHomeScreen({required this.controller, super.key});

  final CustomerController controller;

  @override
  State<CustomerHomeScreen> createState() => _CustomerHomeScreenState();
}

class _CustomerHomeScreenState extends State<CustomerHomeScreen> {
  final smartProductName = TextEditingController();
  final smartDescription = TextEditingController();
  String make = '';
  String model = '';
  String year = '';
  String color = '';
  String governorate = '';
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
  void dispose() {
    smartProductName.dispose();
    smartDescription.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    if (widget.controller.catalogue.makes.isEmpty) {
      widget.controller.loadCatalogue();
    }
  }

  Future<void> search() async {
    if (!canSearch) return;
    await widget.controller.search(
      carMake: make,
      carModel: model,
      carYear: year,
      color: color,
      governorate: governorate,
    );
  }

  bool get canSearch => governorate.isNotEmpty && make.isNotEmpty && model.isNotEmpty;

  bool get canSendSmartRequest =>
      governorate.isNotEmpty &&
      make.isNotEmpty &&
      model.isNotEmpty &&
      specialty.isNotEmpty &&
      smartDescription.text.trim().isNotEmpty;

  Future<void> sendSmartRequest() async {
    if (!canSendSmartRequest) return;
    await widget.controller.submitSmartRequest(
      productName: smartProductName.text,
      description: smartDescription.text,
      carMake: make,
      carModel: model,
      specialty: specialty,
      governorate: governorate,
    );
    if (!mounted) return;
    smartProductName.clear();
    smartDescription.clear();
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
      title: 'سوق Botlly',
      actions: [
        IconButton(
          tooltip: 'طلباتي',
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => CustomerOrdersScreen(controller: c)),
          ),
          icon: const Icon(Icons.receipt_long),
        ),
        IconButton(onPressed: c.logout, icon: const Icon(Icons.logout)),
      ],
      child: RefreshIndicator(
        onRefresh: search,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Text('أهلاً ${c.profile?.name ?? ''}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: make.isEmpty ? null : make,
                      decoration: const InputDecoration(labelText: 'الموديل / الشركة'),
                      items: c.catalogue.makes.map((item) => DropdownMenuItem(value: item.label, child: Text(item.label))).toList(),
                      onChanged: (value) => setState(() {
                        make = value ?? '';
                        model = '';
                      }),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: model.isEmpty ? null : model,
                      decoration: const InputDecoration(labelText: 'النوع'),
                      items: selectedMake.models.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                      onChanged: make.isEmpty ? null : (value) => setState(() => model = value ?? ''),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            initialValue: year.isEmpty ? null : year,
                            decoration: const InputDecoration(labelText: 'سنة الصنع'),
                            items: c.catalogue.years.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                            onChanged: (value) => setState(() => year = value ?? ''),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            initialValue: color.isEmpty ? null : color,
                            decoration: const InputDecoration(labelText: 'اللون'),
                            items: c.catalogue.colors.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                            onChanged: (value) => setState(() => color = value ?? ''),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: governorate.isEmpty ? null : governorate,
                      decoration: const InputDecoration(labelText: 'محافظة التاجر'),
                      items: iraqiGovernorates.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                      onChanged: (value) => setState(() => governorate = value ?? ''),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: c.loading || !canSearch ? null : search,
                        icon: const Icon(Icons.search),
                        label: const Text('بحث'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('البحث الذكي', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                    const Text('اكتب وصف القطعة وسيتم إرسال الطلب للتجار حسب المحافظة ونوع السيارة والموديل والاختصاص.'),
                    const SizedBox(height: 10),
                    TextField(
                      controller: smartProductName,
                      decoration: const InputDecoration(labelText: 'اسم المنتج المطلوب'),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: specialty.isEmpty ? null : specialty,
                      decoration: const InputDecoration(labelText: 'الاختصاص'),
                      items: specialties.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                      onChanged: (value) => setState(() => specialty = value ?? ''),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: smartDescription,
                      maxLines: 3,
                      decoration: const InputDecoration(labelText: 'وصف المنتج'),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 10),
                    FilledButton.icon(
                      onPressed: c.loading || !canSendSmartRequest ? null : sendSmartRequest,
                      icon: const Icon(Icons.send_rounded),
                      label: const Text('إرسال للتجار المختصين'),
                    ),
                  ],
                ),
              ),
            ),
            if (c.error.isNotEmpty) ErrorNotice(message: c.error, onRetry: search),
            const SizedBox(height: 12),
            if (c.loading)
              const SizedBox(height: 260, child: LoadingView())
            else if (!canSearch)
              const SizedBox(height: 260, child: EmptyView(title: 'Select governorate, make and model', subtitle: 'Products appear only after completing the required search filters.'))
            else if (c.products.isEmpty)
              const SizedBox(height: 260, child: EmptyView(title: 'لا توجد نتائج', subtitle: 'غيّر الفلاتر وجرب مرة ثانية.'))
            else
              ...c.products.map((product) => _ProductCard(
                    product: product,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => ProductDetailsScreen(controller: c, product: product)),
                    ),
                  )),
          ],
        ),
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.product, required this.onTap});

  final CustomerProduct product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final image = product.imageUrls.isNotEmpty ? product.imageUrls.first : '';
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Stack(
                  children: [
                    image.startsWith('http')
                        ? Container(
                            width: 84,
                            height: 84,
                            color: Colors.white,
                            child: Image.network(
                              image,
                              width: 84,
                              height: 84,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) => const Icon(Icons.broken_image),
                            ),
                          )
                        : Container(width: 84, height: 84, color: const Color(0xffe2e8f0), child: const Icon(Icons.image)),
                    if (product.imageUrls.length > 1)
                      Positioned(
                        right: 4,
                        bottom: 4,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.65),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            child: Text(
                              '+${product.imageUrls.length - 1}',
                              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(product.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                    Text(money(product.price, product.currency), style: const TextStyle(color: Color(0xff16a34a), fontWeight: FontWeight.w900)),
                    if (product.deliveryEstimate != null) Text(product.deliveryEstimate!, style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
