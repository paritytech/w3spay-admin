/**
 * App-wide frame: scrollable body with optional sticky footer, safe-area
 * insets for iOS/Android. Wraps every screen.
 */

import type { ReactNode } from "react";

import { COLOR, FONT } from "@shared/components/tokens.ts";
import type { Density } from "./Density.ts";

export interface AFrameProps {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  density?: Density;
}

export function AFrame({ children, header, footer, density = "comfortable" }: AFrameProps) {
  const compact = density === "compact";
  return (
    <div
      className="admin-frame"
      style={{
        background: COLOR.bg,
        color: COLOR.text,
        fontFamily: FONT.sans,
        fontSize: 14,
        lineHeight: 1.5,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: "100dvh",
        // Reserve room for the iOS / Android status-bar cutout; the host
        // chrome (dotli topbar, Polkadot Desktop title) sits above this
        // anyway, but the inset keeps the rail away from the notch when
        // the app runs as an installed PWA.
        paddingTop: "max(env(safe-area-inset-top), 8px)",
      }}
    >
      {header}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: compact ? "8px 16px 0" : "12px 20px 0",
        }}
      >
        {children}
        {/* Bottom spacer so the last item clears the sticky footer (or, when
            there is no footer, the home indicator and any chrome). */}
        <div style={{ height: footer ? 24 : 64 }} />
      </div>
      {footer ? (
        <div
          style={{
            flexShrink: 0,
            padding: compact ? "10px 16px" : "12px 20px",
            paddingBottom: `calc(env(safe-area-inset-bottom) + ${compact ? 14 : 16}px)`,
            background: `linear-gradient(to top, ${COLOR.bg} 70%, transparent)`,
            borderTop: `1px solid ${COLOR.surface2}`,
          }}
        >
          {footer}
        </div>
      ) : (
        <div style={{ height: "env(safe-area-inset-bottom)", flexShrink: 0 }} />
      )}
    </div>
  );
}
