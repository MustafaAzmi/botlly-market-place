import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/material.dart';

import '../providers/customer_controller.dart';

class ProductDetailsScreen extends StatefulWidget {
  const ProductDetailsScreen({required this.controller, required this.product, super.key});

  final CustomerController controller;
  final CustomerProduct product;

  @override
  State<ProductDetailsScreen> createState() => _ProductDetailsScreenState();
}

class _ProductDetailsScreenState extends State<ProductDetailsScreen> {
  var sending = false;
  var selectedImage = 0;

  Future<void> order() async {
    setState(() => sending = true);
    try {
      await widget.controller.submitOrder(widget.product);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إرسال الطلب وسيتم إشعارك بالتحديثات.')));
        Navigator.pop(context);
      }
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    return PageFrame(
      title: 'تفاصيل المنتج',
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          AspectRatio(
            aspectRatio: 4 / 3,
            child: _ProductImageGallery(
              imageUrls: product.imageUrls,
              selectedIndex: selectedImage,
              onChanged: (value) => setState(() => selectedImage = value),
            ),
          ),
          const SizedBox(height: 14),
          Text(product.title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Text(money(product.price, product.currency), style: const TextStyle(color: Color(0xff16a34a), fontSize: 20, fontWeight: FontWeight.w900)),
          const SizedBox(height: 12),
          Text(product.description.isEmpty ? 'لا يوجد وصف إضافي.' : product.description),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (product.carMake != null) Chip(label: Text(product.carMake!)),
              if (product.carModel != null) Chip(label: Text(product.carModel!)),
              if (product.carYear != null) Chip(label: Text(product.carYear!)),
              if (product.color != null) Chip(label: Text(product.color!)),
              if (product.merchantGovernorate != null) Chip(label: Text(product.merchantGovernorate!)),
            ],
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: sending ? null : order,
            icon: sending
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.shopping_bag),
            label: const Text('إرسال طلب'),
          ),
        ],
      ),
    );
  }
}

class _ProductImageGallery extends StatelessWidget {
  const _ProductImageGallery({
    required this.imageUrls,
    required this.selectedIndex,
    required this.onChanged,
  });

  final List<String> imageUrls;
  final int selectedIndex;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final validImages = imageUrls.where((image) => image.startsWith('http')).toList();
    if (validImages.isEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Container(
          color: const Color(0xffe2e8f0),
          child: const Icon(Icons.image, size: 48),
        ),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Stack(
        fit: StackFit.expand,
        children: [
          PageView.builder(
            itemCount: validImages.length,
            onPageChanged: onChanged,
            itemBuilder: (context, index) => Container(
              color: Colors.white,
              alignment: Alignment.center,
              child: Image.network(
                validImages[index],
                fit: BoxFit.contain,
                width: double.infinity,
                height: double.infinity,
                errorBuilder: (_, __, ___) => const Icon(Icons.broken_image, size: 48),
              ),
            ),
          ),
          if (validImages.length > 1)
            Positioned(
              right: 10,
              bottom: 10,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.65),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  child: Text(
                    '${selectedIndex + 1}/${validImages.length}',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
