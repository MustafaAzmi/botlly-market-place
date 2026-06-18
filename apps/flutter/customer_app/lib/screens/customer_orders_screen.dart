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
                ? const ListView(children: [SizedBox(height: 320, child: EmptyView(title: 'لا توجد طلبات بعد'))])
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: orders.length,
                    itemBuilder: (context, index) {
                      final order = orders[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: ListTile(
                          title: Text(order.productTitle),
                          subtitle: Text(readableStatus(order.status)),
                          trailing: Text(money(order.price, order.currency)),
                        ),
                      );
                    },
                  ),
          ),
        );
      },
    );
  }
}
