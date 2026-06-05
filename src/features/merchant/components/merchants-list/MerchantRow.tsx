/**
 * Single merchant row in the directory. Editorial card with name +
 * IDs + truncated payout address, status pill, and (in comfortable
 * density) a relative-time stamp.
 */

import { shortAddr, timeAgoFromIso, type AdminMerchant } from "@features/merchant/merchant-model.ts";
import { Icon } from "@shared/components/Icon.tsx";
import { ACard, AMono, AStatus, type Density } from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface MerchantRowProps {
  m: AdminMerchant;
  density: Density;
  onClick: () => void;
}

export function MerchantRow({ m, density, onClick }: MerchantRowProps) {
  const compact = density === "compact";
  return (
    <ACard onClick={onClick} padding={compact ? 12 : 14}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div
              style={{
                fontFamily: FONT.serif,
                fontSize: compact ? 16 : 18,
                letterSpacing: "-0.02em",
                color: COLOR.text,
                lineHeight: 1.1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {m.name}
            </div>
            <KindTag kind={m.kind} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: COLOR.muted,
              fontSize: 11,
              marginBottom: 6,
            }}
          >
            <Icon name="qr-code" size={11} />
            <AMono size={11} color={COLOR.text3} weight={400}>
              {m.kind === "t3rminal" ? `t3r-…${m.terminalId.slice(-6)}` : m.terminalId}
            </AMono>
            <span>·</span>
            <AMono size={11} color={COLOR.muted} weight={400}>
              {m.merchantId}
            </AMono>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLOR.text3, fontSize: 11 }}>
            <Icon name="wallet" size={11} />
            <AMono size={11} color={COLOR.text3} weight={400}>
              {shortAddr(m.destinationSs58)}
            </AMono>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <AStatus status={m.status} />
          {!compact ? (
            <div style={{ textAlign: "right", fontSize: 10, color: COLOR.muted }}>
              <div>updated</div>
              <div style={{ marginTop: 1 }}>{timeAgoFromIso(m.updatedAt)}</div>
            </div>
          ) : null}
        </div>
      </div>
    </ACard>
  );
}

function KindTag({ kind }: { kind: AdminMerchant["kind"] }) {
  const isT3rminal = kind === "t3rminal";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        borderRadius: 999,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        background: isT3rminal ? "rgba(34,197,94,0.10)" : COLOR.surface2,
        color: isT3rminal ? COLOR.green : COLOR.text3,
        border: `1px solid ${isT3rminal ? "rgba(34,197,94,0.30)" : COLOR.border}`,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {isT3rminal ? "T3R" : "POS"}
    </span>
  );
}
