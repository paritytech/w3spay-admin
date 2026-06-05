/**
 * Top wordmark rail. Mark + W3sPay title + optional admin/pilot subtitle
 * (or a custom `right` slot). Sits above the tab bar.
 */

import type { ReactNode } from "react";

import { Mark } from "@shared/components/Mark.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface ARailProps {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
}

export function ARail({ title = "W3sPay", subtitle, right }: ARailProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 20px 8px",
        borderBottom: `1px solid ${COLOR.surface2}`,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Mark size={16} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div
            style={{
              fontFamily: FONT.serif,
              fontSize: 15,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                fontFamily: FONT.serif,
                fontStyle: "italic",
                fontSize: 12,
                color: COLOR.muted,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
      {right ?? (
        <div
          style={{
            color: COLOR.muted,
            fontSize: 9,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          Admin · Pilot
        </div>
      )}
    </div>
  );
}
