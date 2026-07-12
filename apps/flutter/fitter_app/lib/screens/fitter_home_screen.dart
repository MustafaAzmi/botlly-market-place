import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/material.dart';

import '../providers/fitter_controller.dart';

class FitterHomeScreen extends StatefulWidget {
  const FitterHomeScreen({required this.controller, super.key});

  final FitterController controller;

  @override
  State<FitterHomeScreen> createState() => _FitterHomeScreenState();
}

class _FitterHomeScreenState extends State<FitterHomeScreen> {
  var tab = 0;

  @override
  void initState() {
    super.initState();
    widget.controller.loadCatalogue();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return PageFrame(
      title: 'Botlly Fitter',
      actions: [
        IconButton(onPressed: c.logout, icon: const Icon(Icons.logout)),
      ],
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 0, label: Text('البحث الذكي'), icon: Icon(Icons.search)),
                ButtonSegment(value: 1, label: Text('طلباتي'), icon: Icon(Icons.assignment)),
              ],
              selected: {tab},
              onSelectionChanged: (value) => setState(() => tab = value.first),
            ),
          ),
          Expanded(
            child: tab == 0 ? _ProductsTab(controller: c) : _OrdersTab(controller: c),
          ),
        ],
      ),
    );
  }
}

class _ProductsTab extends StatefulWidget {
  const _ProductsTab({required this.controller});

  final FitterController controller;

  @override
  State<_ProductsTab> createState() => _ProductsTabState();
}

class _ProductsTabState extends State<_ProductsTab> {
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
    return RefreshIndicator(
      onRefresh: c.refreshSummary,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
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
          if (c.loading)
            const SizedBox(height: 260, child: LoadingView())
        ],
      ),
    );
  }
}

class _ProductThumbnail extends StatelessWidget {
  const _ProductThumbnail({required this.product, required this.size});

  final CustomerProduct product;
  final double size;

  @override
  Widget build(BuildContext context) {
    final image = product.imageUrls.isNotEmpty ? product.imageUrls.first : '';
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Stack(
        children: [
          image.startsWith('http')
              ? Container(
                  width: size,
                  height: size,
                  color: Colors.white,
                  child: Image.network(
                    image,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Icon(Icons.broken_image),
                  ),
                )
              : Container(width: size, height: size, color: const Color(0xffe2e8f0), child: const Icon(Icons.image)),
          if (product.imageUrls.length > 1)
            Positioned(
              right: 3,
              bottom: 3,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.65),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  child: Text(
                    '+${product.imageUrls.length - 1}',
                    style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _OrdersTab extends StatelessWidget {
  const _OrdersTab({required this.controller});

  final FitterController controller;

  @override
  Widget build(BuildContext context) {
    final summary = controller.summary;
    final orders = summary?.orders ?? const <FitterOrder>[];
    return RefreshIndicator(
      onRefresh: controller.refreshSummary,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Card(
            child: ListTile(
              title: const Text('إجمالي الربح'),
              subtitle: Text('${summary?.salesCount ?? 0} طلب مؤكد'),
              trailing: Text(money(summary?.totalProfit ?? 0, summary?.currency ?? 'IQD')),
            ),
          ),
          const SizedBox(height: 12),
          if (orders.isEmpty)
            const SizedBox(height: 260, child: EmptyView(title: 'لا توجد طلبات حالياً'))
          else
            ...orders.map((order) => Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(order.productTitle, style: const TextStyle(fontWeight: FontWeight.w900)),
                        const SizedBox(height: 6),
                        Text('الحالة: ${readableStatus(order.status)}'),
                        Text('السعر: ${money(order.productPrice, order.currency)}'),
                        Text('العمولة: ${money(order.commissionAmount, order.currency)}'),
                        if (order.merchantStoreName.isNotEmpty) Text('التاجر: ${order.merchantStoreName}'),
                        if (order.merchantAddress.isNotEmpty) Text('العنوان: ${order.merchantAddress}'),
                        if (order.merchantWhatsapp.isNotEmpty) Text('واتساب التاجر: ${order.merchantWhatsapp}', textDirection: TextDirection.ltr),
                        const SizedBox(height: 10),
                        if (order.canRequesterAct) Row(
                          children: [
                            Expanded(
                              child: FilledButton(
                                onPressed: () => controller.confirmOrder(order),
                                child: const Text('تم الشراء'),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () => controller.cancelOrder(order),
                                child: const Text('تم إلغاء الطلب'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                )),
        ],
      ),
    );
  }
}
