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
  String make = '';
  String model = '';
  String year = '';
  String color = '';
  String governorate = '';

  @override
  void initState() {
    super.initState();
    if (widget.controller.catalogue.makes.isEmpty) {
      widget.controller.loadCatalogue().then((_) => widget.controller.search());
    } else {
      widget.controller.search();
    }
  }

  Future<void> search() async {
    await widget.controller.search(
      carMake: make,
      carModel: model,
      carYear: year,
      color: color,
      governorate: governorate,
    );
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
                        onPressed: c.loading ? null : search,
                        icon: const Icon(Icons.search),
                        label: const Text('بحث'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (c.error.isNotEmpty) ErrorNotice(message: c.error, onRetry: search),
            const SizedBox(height: 12),
            if (c.loading)
              const SizedBox(height: 260, child: LoadingView())
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
                child: image.startsWith('http')
                    ? Image.network(image, width: 84, height: 84, fit: BoxFit.cover)
                    : Container(width: 84, height: 84, color: const Color(0xffe2e8f0), child: const Icon(Icons.image)),
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
