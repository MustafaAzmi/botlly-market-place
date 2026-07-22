import 'dart:async';

import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/material.dart';

import 'providers/fitter_controller.dart';
import 'screens/fitter_home_screen.dart';
import 'screens/fitter_login_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  unawaited(MobileNotificationService.instance.initialize());
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
  };
  runZonedGuarded(
    () => runApp(const FitterRoot()),
    (error, stack) => runApp(BootCrashApp(title: 'Botlly Fitter', error: error)),
  );
}

class FitterRoot extends StatefulWidget {
  const FitterRoot({super.key});

  @override
  State<FitterRoot> createState() => _FitterRootState();
}

class _FitterRootState extends State<FitterRoot> {
  final controller = FitterController();
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
      title: 'Botlly Fitter',
      seed: const Color(0xff2563eb),
      home: AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          if (booting) return const Scaffold(body: LoadingView());
          if (controller.profile == null) return FitterLoginScreen(controller: controller);
          return FitterHomeScreen(controller: controller);
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
      seed: const Color(0xff2563eb),
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
