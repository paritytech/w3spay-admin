/**
 * Soft body-copy block used inside access-gate cards. Pulls text away
 * from the eyebrow line at the top of the card.
 */

import type { ReactNode } from "react";

import { COLOR } from "@shared/components/tokens.ts";

export function Description({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: COLOR.text2, lineHeight: 1.5, marginTop: 8 }}>
      {children}
    </div>
  );
}
