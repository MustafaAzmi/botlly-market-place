import 'package:flutter/material.dart';

class BotllyApp extends StatelessWidget {
  const BotllyApp({required this.title, required this.home, this.seed = const Color(0xff16a34a), super.key});

  final String title;
  final Widget home;
  final Color seed;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: title,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.light),
        useMaterial3: true,
        fontFamily: 'Roboto',
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(8))),
        ),
        cardTheme: const CardThemeData(
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(8))),
        ),
      ),
      home: Directionality(textDirection: TextDirection.rtl, child: home),
    );
  }
}

class PageFrame extends StatelessWidget {
  const PageFrame({required this.title, required this.child, this.actions = const [], super.key});

  final String title;
  final Widget child;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const _BotllyLogoMark(),
            const SizedBox(width: 8),
            Text(title),
          ],
        ),
        actions: actions,
      ),
      body: SafeArea(child: child),
    );
  }
}

class _BotllyLogoMark extends StatelessWidget {
  const _BotllyLogoMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary,
        shape: BoxShape.circle,
      ),
      child: const Icon(Icons.shopping_bag_rounded, color: Colors.white, size: 18),
    );
  }
}
