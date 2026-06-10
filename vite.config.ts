import { sentryVitePlugin } from "@sentry/vite-plugin";
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const srcPath = (path: string) => new URL(path, import.meta.url).pathname;


const NODE_BUILTINS = [
  /^node:/,
  "fs",
  "path",
  "os",
  "util",
  "module",
  "child_process",
  "fs/promises",
];

export default defineConfig(({ mode }) => ({
  base: "./",

  define: {
    global: "globalThis",
  },
  plugins: [
    react(),
    // Sentry source-map upload is an explicit release-engineering opt-in:
    // without VITE_W3SPAY_SENTRY_ENABLED=true the plugin is never even loaded, so a plain
    // dev/test/build makes NO Sentry calls (no plugin phone-home telemetry,
    // no release creation, no .env.sentry-build-plugin upload). Runtime app
    // events are governed separately by the kill switch in src/config.ts.
    ...(process.env.VITE_W3SPAY_SENTRY_ENABLED === "true"
      ? [sentryVitePlugin({ org: "paritytech", project: "w3spay", telemetry: false })]
      : []),
  ],
  resolve: {
    alias: {
      "@": srcPath("./src"),
      "@app": srcPath("./src/app"),
      "@features": srcPath("./src/features"),
      "@shared": srcPath("./src/shared"),
      gifenc: srcPath("./node_modules/gifenc/dist/gifenc.esm.js"),
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  esbuild: {
    target: "es2022",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    server: {
      deps: { inline: ["@bcts/multipart-ur"] },
    },
  },
}));
