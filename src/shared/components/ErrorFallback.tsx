/**
 * Top-level error boundary fallback.
 *
 * The admin console runs inside the host's mobile webview / dotli iframe
 * where there is no DevTools to inspect a white screen. A render error
 * that escapes every component-level boundary lands here (wired in
 * `main.tsx` via `<Sentry.ErrorBoundary>`), keeping the app chrome
 * (rail + frame) intact and offering a reload instead of a blank page.
 *
 * Sentry has already captured the error by the time this renders
 * (`@sentry/react`'s ErrorBoundary reports before showing the fallback),
 * so this component is purely the recovery surface.
 */

import { ARail, AFrame, APrimary } from "./primitives.tsx";
import { COLOR, FONT } from "./tokens.ts";

export function ErrorFallback() {
  return (
    <div className="workspace">
      <AFrame header={<ARail title="W3sPay" subtitle="admin" />}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            padding: "40px 4px",
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: FONT.serif, fontSize: 20 }}>
            Something went wrong
          </div>
          <div style={{ color: COLOR.muted, fontSize: 13, lineHeight: 1.6 }}>
            The console hit an unexpected error and stopped. Reloading
            usually clears it. If it keeps happening, the issue has been
            reported automatically.
          </div>
          <div style={{ marginTop: 8 }}>
            <APrimary onClick={() => window.location.reload()} full={false}>
              Reload
            </APrimary>
          </div>
        </div>
      </AFrame>
    </div>
  );
}
