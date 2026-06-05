/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const srcPath = (path: string) => new URL(path, import.meta.url).pathname;

// W3sPay admin — pilot console. Served on its own port so it can run side
// by side with the cashier-facing apps/w3spay.
export default defineConfig({
  base: "./",
  // Best-effort static rewrite of the Node-only `global` identifier some
  // transitive deps (e.g. `collections`, via `@bcts/multipart-ur` →
  // `@bcts/uniform-resources` → `@bcts/dcbor`) reference at module top
  // level. NOTE: this does NOT reach those CommonJS deps in the production
  // (Rollup) build — the built bundle still ships raw `global.Set` /
  // `global.Map` / `global.DOMTokenList`. The runtime guarantee against the
  // resulting `global is not defined` blank screen is the inline polyfill
  // in index.html, which runs before this bundle. This define stays only to
  // trim the remaining `global` refs that the rewrite does catch.
  define: {
    global: "globalThis",
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": srcPath("./src"),
      "@app": srcPath("./src/app"),
      "@features": srcPath("./src/features"),
      "@shared": srcPath("./src/shared"),
    },
  },
  build: {
    target: "es2022",
  },
  esbuild: {
    target: "es2022",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    server: {
      deps: {
        // The `@bcts/multipart-ur` ESM imports the `gifenc` CJS module
        // by name; Vite's transform layer handles that interop, Node's
        // does not. Inline the package so Vitest runs it through Vite.
        inline: [/@bcts\/multipart-ur/],
      },
    },
  },
});
