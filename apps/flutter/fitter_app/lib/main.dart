import 'package:botlly_mobile_shared/botlly_mobile_shared.dart';
import 'package:flutter/material.dart';

import 'providers/fitter_controller.dart';
import 'screens/fitter_home_screen.dart';
import 'screens/fitter_login_screen.dart';

void main() {
  runApp(const FitterRoot());
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
