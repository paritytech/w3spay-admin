/**
 * Items tab — single-config detail screen.
 *
 * Renders the flat item list, exposes config-level actions (duplicate,
 * add item, delete), and surfaces the published/dirty state captured by
 * the draft layer. The "configure T3rminal" flow lives on the
 * `MerchantDetail` screen — published configs are consumed there.
 *
 * Mutations are owned by the parent orchestrator; this view stays
 * presentational so it remains storybookable.
 */

import { useState } from "react";

import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { Icon } from "@shared/components/Icon.tsx";
import {
  ACard,
  AEye,
  AGhost,
  AMono,
  APrimary,
  ASecondary,
} from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import { fmtCASH, type ItemConfig } from "@features/items/items-model.ts";
import { shortAddr } from "@features/merchant/merchant-model.ts";
import type { PublishedConfigSnapshot } from "@features/items/item-config-drafts.ts";
import { isConfigDirty } from "@features/items/item-config-drafts.ts";
import { ItemRow } from "./ItemRow.tsx";
import { DANGER_BTN_STYLE } from "./items-styles.ts";

export interface ItemsDetailProps {
  config: ItemConfig;
  publishedSnapshot: PublishedConfigSnapshot | null;
  onBack: () => void;
  onCopyId: () => void;
  onAddItem: () => void;
  onEditItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onDuplicate: () => void;
  onDeleteConfig: () => void;
  onSave: () => void;
  saving: boolean;
}

export function ItemsDetail({
  config,
  publishedSnapshot,
  onBack,
  onCopyId,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onDuplicate,
  onDeleteConfig,
  onSave,
  saving,
}: ItemsDetailProps) {
  const copiedField = useFeedbackStore((s) => s.copiedField);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const items = config.items;
  const avg = items.length ? items.reduce((s, i) => s + i.price, 0) / items.length : 0;
  const prices = items.map((i) => i.price);
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;
  const idCopied = copiedField === `config:${config.id}`;
  const dirty = isConfigDirty(config, publishedSnapshot?.snapshot ?? null);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <AGhost onClick={onBack}>
          <Icon name="chevron-left" size={14} /> Back
        </AGhost>
        <AGhost onClick={onCopyId} color={idCopied ? COLOR.green : COLOR.text3} title={`config:${config.id}`}>
          <Icon name={idCopied ? "check" : "copy"} size={12} /> {idCopied ? "Copied" : `config:${shortAddr(config.id, 10, 6)}`}
        </AGhost>
      </div>

      <AEye>Config</AEye>
      <h1
        style={{
          fontFamily: FONT.serif,
          fontWeight: 400,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          fontSize: 32,
          margin: "6px 0 4px",
        }}
      >
        {config.name}
      </h1>
      <div style={{ color: COLOR.text3, fontSize: 13, marginBottom: 14 }}>
        {items.length} {items.length === 1 ? "item" : "items"}
        {items.length > 0 ? (
          <>
            {" · "}avg <AMono size={12} color={COLOR.text2}>{fmtCASH(avg)}</AMono>
            {" · "}
            <AMono size={12} color={COLOR.muted}>
              {fmtCASH(minP)}–{fmtCASH(maxP)} CASH
            </AMono>
          </>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
        <ASecondary onClick={onDuplicate} icon={<Icon name="copy" size={13} />}>
          Duplicate
        </ASecondary>
        <ASecondary onClick={onAddItem} icon={<Icon name="plus" size={13} />}>
          Add item
        </ASecondary>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: "32px 16px",
            textAlign: "center",
            color: COLOR.muted,
            background: COLOR.surface,
            border: `1px dashed ${COLOR.border}`,
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontFamily: FONT.serif,
              fontStyle: "italic",
              fontSize: 18,
              color: COLOR.text3,
              marginBottom: 6,
            }}
          >
            No items yet.
          </div>
          <div style={{ fontSize: 12 }}>Add one to start populating the menu.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onEdit={() => onEditItem(item.id)}
              onDelete={() => onDeleteItem(item.id)}
            />
          ))}
          <div
            style={{
              textAlign: "right",
              fontSize: 10,
              color: COLOR.faint,
              marginTop: 6,
              letterSpacing: "0.08em",
              fontFamily: FONT.mono,
            }}
          >
            ∑ {fmtCASH(items.reduce((s, i) => s + i.price, 0))} CASH
          </div>
        </div>
      )}

      <div style={{ height: 6 }} />
      <AEye>Publish status</AEye>
      <ACard padding={14} style={{ marginTop: 8 }}>
        {publishedSnapshot ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: COLOR.text3, lineHeight: 1.5 }}>
            <div>
              <span style={{ color: dirty ? COLOR.redSoft : COLOR.green, fontWeight: 500 }}>
                {dirty ? "Unsaved changes" : "Published"}
              </span>
              {" · "}
              <AMono size={11} color={COLOR.text2} title={publishedSnapshot.cid}>
                {shortAddr(publishedSnapshot.cid, 10, 8)}
              </AMono>
            </div>
            <div>
              <AMono size={11} color={COLOR.muted}>{publishedSnapshot.size}</AMono> bytes
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: COLOR.text3, lineHeight: 1.5 }}>
            Not yet published. Save from the Items tab to upload this config to Bulletin Chain and register its CID on the merchant registry contract.
          </div>
        )}
      </ACard>

      <div style={{ height: 18 }} />
      <AEye>Linked terminals</AEye>
      <ACard padding={14} style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, color: COLOR.text3, lineHeight: 1.5 }}>
          T3rminal devices receive this config by CID from their generated QR code. To bind a config to a T3rminal merchant row, open the merchant from the Merchants tab and tap “Configure T3rminal”.
        </div>
      </ACard>

      <div style={{ height: 18 }} />
      <AEye>Danger</AEye>
      <div style={{ marginTop: 8 }}>
        {confirmingDelete ? (
          <div style={{ display: "flex", gap: 8 }}>
            <ASecondary full={false} onClick={() => setConfirmingDelete(false)}>
              Cancel
            </ASecondary>
            <APrimary danger full={false} onClick={onDeleteConfig}>
              Confirm delete
            </APrimary>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmingDelete(true)} style={DANGER_BTN_STYLE}>
            Delete config
          </button>
        )}
      </div>
      {dirty ? (
        <div style={{ marginTop: 10 }}>
          <ASecondary onClick={saving ? undefined : onSave} disabled={saving}>
            <Icon name="check" size={13} />{" "}
            {saving ? "Publishing…" : "Save & publish changes"}
          </ASecondary>
        </div>
      ) : null}
    </>
  );
}
