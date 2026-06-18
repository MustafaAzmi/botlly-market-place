import 'dart:async';

import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/material.dart';

import 'providers/customer_controller.dart';
import 'screens/customer_home_screen.dart';
import 'screens/customer_login_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
  };
  runZonedGuarded(
    () => runApp(const CustomerRoot()),
    (error, stack) => runApp(BootCrashApp(title: 'Botlly Customer', error: error)),
  );
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
    controller.restore().whenComplete(() {
      if (mounted) setState(() => booting = false);
    });
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

class BootCrashApp extends StatelessWidget {
  const BootCrashApp({required this.title, required this.error, super.key});

  final String title;
  final Object error;

  @override
  Widget build(BuildContext context) {
    return BotllyApp(
      title: title,
      home: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 16),
                const Text(
                  'تعذر فتح التطبيق',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                Text(
                  error.toString(),
                  textAlign: TextAlign.center,
                  textDirection: TextDirection.ltr,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
