import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/material.dart';

import 'providers/customer_controller.dart';
import 'screens/customer_home_screen.dart';
import 'screens/customer_login_screen.dart';

void main() {
  runApp(const CustomerRoot());
}

class CustomerRoot extends StatefulWidget {
  const CustomerRoot({super.key});

  @override
  State<CustomerRoot> createState() => _CustomerRootState();
}

class _CustomerRootState extends State<CustomerRoot> {
  final controller = CustomerController();
  var booting = true;

  @override
  void initState() {
    super.initState();
    controller.restore().whenComplete(() => setState(() => booting = false));
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BotllyApp(
      title: 'Botlly Customer',
      home: AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          if (booting) return const Scaffold(body: LoadingView());
          if (controller.profile == null) return CustomerLoginScreen(controller: controller);
          return CustomerHomeScreen(controller: controller);
        },
      ),
    );
  }
}
