import { defineConfig } from "bulletin-deploy";

// Product manifest for the W3sPay admin console SPA. `./deploy.sh` publishes
// this to DotNS as `w3spayadmin.dot`; the `domain` here MUST equal that deploy
// target or `publishManifest` aborts. (It is a sibling of `apps/w3spay`, NOT
// the same product — keep the domain distinct.)
//
// `icon.path` and every `executables[].path` are resolved relative to THIS
// file. `./dist` is Vite's default build output and is exactly the directory
// `deploy.sh` uploads, so the app executable reuses that already-uploaded CID
// instead of re-storing the same bytes. This is a single-entry SPA — there is
// no widget or worker build, so `app` is the only executable.
export default defineConfig({
  domain: "w3spayadmin.dot",
  displayName: "W3sPay Admin",
  description:
    "W3sPay pilot admin console — register merchant terminals on chain, manage lifecycle status.",
  icon: { path: "./icon.png", format: "png" },
  executables: [
    {
      kind: "app",
      path: "./dist",
      appVersion: [0, 1, 0],
    },
  ],
});
