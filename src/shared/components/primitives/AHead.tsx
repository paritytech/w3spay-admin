/**
 * Page-level title block. DM Serif headline with optional small eyebrow
 * above it (kicker line).
 */

import type { ReactNode } from "react";

import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface AHeadProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  italic?: boolean;
  size?: number;
}

export function AHead({ eyebrow, title, italic, size = 32 }: AHeadProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      {eyebrow ? (
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: COLOR.muted,
            marginBottom: 6,
            fontWeight: 500,
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <h1
        style={{
          fontFamily: FONT.serif,
          fontStyle: italic ? "italic" : "normal",
          fontWeight: 400,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          color: COLOR.text,
          fontSize: size,
          margin: 0,
          textWrap: "pretty",
        }}
      >
        {title}
      </h1>
    </div>
  );
}
