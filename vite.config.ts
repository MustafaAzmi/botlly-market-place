// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { execSync } from "node:child_process";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Regenerate the PWA PNG icons from the checked-in script on every dev/build
// start. The deploy pipeline doesn't reliably ship binary files pushed via
// git, so the icons are (re)created as a build artifact on the server itself —
// only text sources need to survive the sync.
try {
  execSync("node scripts/generate-pwa-icons.mjs", { stdio: "ignore" });
} catch {
  // Never block the build on icon generation.
}

export default defineConfig({
  // `noExternals: ["tslib"]` forces Nitro to bundle tslib into the server output
  // instead of externalizing it. Nitro's dependency tracer only copies a partial
  // set of tslib's files (it misses tslib.es6.mjs that the exports map points to),
  // which breaks Netlify's function packaging step ("Could not resolve tslib").
  // Inlining it sidesteps the trace entirely.
  nitro: {
    // @ts-expect-error Supported by Nitro at runtime but absent from this beta config type.
    noExternals: ["tslib"],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
