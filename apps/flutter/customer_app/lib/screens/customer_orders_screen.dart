import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/material.dart';

import '../providers/customer_controller.dart';

class CustomerOrdersScreen extends StatefulWidget {
  const CustomerOrdersScreen({required this.controller, super.key});

  final CustomerController controller;

  @override
  State<CustomerOrdersScreen> createState() => _CustomerOrdersScreenState();
}

class _CustomerOrdersScreenState extends State<CustomerOrdersScreen> {
  @override
  void initState() {
    super.initState();
    widget.controller.refreshOrders();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final orders = widget.controller.orders;
        return PageFrame(
          title: 'طلباتي',
          child: RefreshIndicator(
            onRefresh: widget.controller.refreshOrders,
            child: orders.isEmpty
                ? ListView(children: const [SizedBox(height: 320, child: EmptyView(title: 'لا توجد طلبات بعد'))])
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: orders.length,
                    itemBuilder: (context, index) {
                      final order = orders[index];
                      final closed = order.status == 'cancelled' || order.status == 'purchased';
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Text(
                                      order.productTitle,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontWeight: FontWeight.w900),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(money(order.price, order.currency), textDirection: TextDirection.ltr),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text('الحالة: ${readableStatus(order.status)}'),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: closed || widget.controller.loading
                                          ? null
                                          : () => _updateOrder(context, order, 'cancelled'),
                                      icon: const Icon(Icons.close),
                                      label: const Text('إلغاء الطلب'),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: FilledButton.icon(
                                      onPressed: closed || widget.controller.loading
                                          ? null
                                          : () => _updateOrder(context, order, 'purchased'),
                                      icon: const Icon(Icons.check),
                                      label: const Text('تم الشراء'),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        );
      },
    );
  }

  Future<void> _updateOrder(BuildContext context, CustomerOrder order, String status) async {
    try {
      if (status == 'purchased') {
        await widget.controller.markOrderPurchased(order);
      } else {
        await widget.controller.cancelOrder(order);
      }
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم تحديث حالة الطلب وإرسال الإشعار.')));
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    }
  }
}
