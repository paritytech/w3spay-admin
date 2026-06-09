// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { AGhost } from "@shared/components/primitives.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import { COLOR } from "@shared/components/tokens.ts";

export function HydratingNotice() {
  return (
    <div style={{ marginTop: 24, color: COLOR.muted, fontSize: 13 }}>
      Loading restaurants…
    </div>
  );
}

export function MissingRestaurant({ id, onBack }: { id: string; onBack: () => void }) {
  return (
    <>
      <AGhost onClick={onBack}>
        <Icon name="chevron-left" size={14} /> Back
      </AGhost>
      <div style={{ marginTop: 24, color: COLOR.muted, fontSize: 13 }}>
        No restaurant with id "{id}".
      </div>
    </>
  );
}
