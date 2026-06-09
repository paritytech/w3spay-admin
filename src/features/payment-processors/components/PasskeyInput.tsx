// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { AInput } from "@shared/components/primitives.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import { COLOR } from "@shared/components/tokens.ts";

export function PasskeyInput({
  value,
  onChange,
  show,
  onToggle,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <div style={{ flex: 1 }}>
        <AInput value={value} onChange={onChange} placeholder="passkey" type={show ? "text" : "password"} />
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide passkey" : "Show passkey"}
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 4,
          color: COLOR.muted,
          alignItems: "center",
        }}
      >
        <Icon name={show ? "eye-off" : "eye"} size={16} />
      </button>
    </div>
  );
}
