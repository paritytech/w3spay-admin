// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { COLOR } from "@shared/components/tokens.ts";

export function ErrorBox({ message }: { message: string }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        border: `1px solid ${COLOR.red}`,
        borderRadius: 12,
        background: "rgba(239,68,68,0.08)",
        color: COLOR.redSoft,
        fontSize: 12,
      }}
    >
      {message}
    </div>
  );
}
