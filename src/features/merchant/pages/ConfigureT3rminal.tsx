// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Color,
  CorrectionLevel,
  DEFAULT_MAX_MODULES,
  encodeAnimatedGif,
  generateFrames,
  qrModuleCount,
  renderUrQr,
} from "@bcts/multipart-ur";

import { resolveEffectiveRegistryAddress } from "@shared/lib/demo/demo-contracts.ts";
import { useSession } from "@features/session/contracts/use-session.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { useMerchants } from "@features/merchant/contracts/use-merchants.ts";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { useItemConfigs } from "@features/items/contracts/use-item-configs.ts";
import { useT3rminalAssignments } from "@shared/store/use-assignments-store.ts";
import type { UseT3rminalAssignmentsResult } from "@shared/store/t3rminal-assignments.ts";
import { useRestaurants } from "@features/restaurants/contracts/use-restaurants.ts";
import {
  buildT3rminalConfigPayloadV2,
  encodeT3rminalConfigPayloadV2,
} from "@shared/lib/t3rminal-config-qr.ts";
import { isConfigDirty } from "@features/items/item-config-drafts.ts";
import { shortAddr, type AdminMerchant } from "@features/merchant/merchant-model.ts";
import {
  restaurantPickerHint,
  type Restaurant,
  type UseRestaurantsResult,
} from "@features/restaurants/restaurants.ts";
import type { MerchantProfile } from "@/shared/lib/config-qr";
import type { UseItemConfigsResult } from "@features/items/item-configs.ts";
import { CopyableRow } from "@shared/components/CopyableRow.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import {
  ACard,
  ADotted,
  AEye,
  AGhost,
  AMono,
  APrimary,
  ASecondary,
} from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";

const TEXT_ENCODER = /* @__PURE__ */ new TextEncoder();
const ANIMATED_QR_FPS = 8;

interface QrRender {
  readonly url: string;
  readonly mode: "static" | "animated";
  readonly byteLength: number;
  readonly moduleCount: number;
  readonly partsCount: number | null;
}

export interface ConfigureT3rminalRouteProps {
  merchantKey: string;
}

export function ConfigureT3rminalRoute({ merchantKey }: ConfigureT3rminalRouteProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { merchants } = useMerchants();
  const { readyAccount } = useSession();
  const copyValue = useFeedbackStore((s) => s.copyValue);
  const copiedField = useFeedbackStore((s) => s.copiedField);
  const items = useItemConfigs();
  const assignments = useT3rminalAssignments();
  const restaurants = useRestaurants();

  const onBack = () =>
    canGoBack
      ? router.history.back()
      : navigate({ to: "/merchants/$merchantKey", params: { merchantKey } });

  const merchant = useMemo(
    () => merchants.find((m) => m.key === merchantKey) ?? null,
    [merchants, merchantKey],
  );

  if (!merchant) {
    return <Guard onBack={onBack} message="Merchant not found." />;
  }
  if (merchant.kind !== "t3rminal") {
    return (
      <Guard
        onBack={onBack}
        message="This merchant is a POS terminal — configure-T3rminal applies to T3rminal devices only."
      />
    );
  }
  if (readyAccount == null) {
    return (
      <Guard
        onBack={onBack}
        message="Sign in via the Polkadot host to derive a report password and publish to Bulletin."
      />
    );
  }
  const effectiveRegistryAddress = resolveEffectiveRegistryAddress();
  if (effectiveRegistryAddress.trim() === "") {
    return (
      <Guard
        onBack={onBack}
        message="VITE_W3SPAY_REGISTRY_ADDRESS is not configured for this deploy."
      />
    );
  }

  return (
    <ConfigureT3rminalBody
      merchant={merchant}
      adminPublicKey={readyAccount.productAccount.publicKey}
      items={items}
      assignments={assignments}
      restaurants={restaurants}
      copyValue={copyValue}
      copiedField={copiedField}
      onBack={onBack}
      onNewRestaurant={() =>
        navigate({
          to: "/restaurants/new",
          search: merchantKey ? { from: merchantKey } : {},
        })
      }
    />
  );
}

interface ConfigureT3rminalBodyProps {
  merchant: AdminMerchant;
  adminPublicKey: Uint8Array;
  items: UseItemConfigsResult;
  assignments: UseT3rminalAssignmentsResult;
  restaurants: UseRestaurantsResult;
  copyValue: (value: string, field: string) => void;
  copiedField: string | null;
  onBack: () => void;
  onNewRestaurant: () => void;
}

function ConfigureT3rminalBody(props: ConfigureT3rminalBodyProps) {
  const { merchant, adminPublicKey, items, assignments, restaurants, copyValue, copiedField, onBack, onNewRestaurant } =
    props;

  // Pull the configs that have a registry record AND a fetched body —
  // we cannot generate a QR for a draft-only config.
  const publishable = useMemo(() => {
    const out: Array<{
      readonly id: string;
      readonly name: string;
      readonly cid: string;
      readonly dirty: boolean;
    }> = [];
    for (const draft of items.configs) {
      const snapshot = items.publishedSnapshots.get(draft.id);
      if (!snapshot || snapshot.snapshot == null) continue;
      out.push({
        id: draft.id,
        name: draft.name,
        cid: snapshot.cid,
        dirty: isConfigDirty(draft, snapshot.snapshot),
      });
    }
    return out;
  }, [items.configs, items.publishedSnapshots]);

  const existingAssignment = assignments.assignments.get(merchant.key) ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(
    existingAssignment?.itemConfigId ?? (publishable[0]?.id ?? null),
  );

  useEffect(() => {
    if (selectedId == null && publishable.length > 0) {
      const fallback = publishable[0];
      if (fallback) setSelectedId(fallback.id);
    }
  }, [publishable, selectedId]);

  const selected = publishable.find((c) => c.id === selectedId) ?? null;
  const selectedConfig = selected ? items.configs.find((c) => c.id === selected.id) ?? null : null;

  const [qrRender, setQrRender] = useState<QrRender | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [payloadUr, setPayloadUr] = useState<string | null>(null);
  const [generatedAssignment, setGeneratedAssignment] = useState(existingAssignment);
  const [generatedProfile, setGeneratedProfile] = useState<MerchantProfile | null>(null);

  const { restaurants: restaurantsMap, hydrated: restaurantsHydrated, getRestaurant } = restaurants;

  // Sorted snapshot for the restaurant picker (alphabetic on display
  // name). Memoised on the underlying map so the picker doesn't
  // re-shuffle when an unrelated state slice changes.
  const restaurantList = useMemo<ReadonlyArray<Restaurant>>(() => {
    const list = Array.from(restaurantsMap.values());
    list.sort((a, b) => a.profile.name.localeCompare(b.profile.name));
    return list;
  }, [restaurantsMap]);

  // Restaurant picked for THIS QR. Seeded the first time the store
  // hydrates with a value that resolves: either the just-created-
  // restaurant hint (set by the new-restaurant flow when it kicks
  // back here) or whichever saved restaurant's id matches the
  // terminal's on-chain merchantId — preserving the pre-rename
  // "one merchant ↔ one profile" default.
  //
  // The hint is captured into a ref on first hydration so we don't
  // race the host-KV write from the new-restaurant flow: if the
  // restaurant isn't visible yet in the freshly-hydrated map, we
  // hold the hint across re-renders until the map catches up
  // (`hasSeededRef` flips only when we actually applied it).
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const pendingHintRef = useRef<string | null | undefined>(undefined);
  const hasSeededRef = useRef(false);

  useEffect(() => {
    if (hasSeededRef.current) return;
    if (!restaurantsHydrated) return;
    if (pendingHintRef.current === undefined) {
      pendingHintRef.current = restaurantPickerHint.consume(merchant.key);
    }
    const hint = pendingHintRef.current;
    if (hint != null) {
      const found = getRestaurant(hint);
      if (found != null) {
        setSelectedRestaurantId(found.id);
        hasSeededRef.current = true;
      }
      // else: keep the hint pending; this effect re-runs when the
      // `restaurantsMap` identity changes so a freshly-written record
      // landing in the map will be picked up on the next render.
      return;
    }
    setSelectedRestaurantId(
      getRestaurant(merchant.merchantId) != null ? merchant.merchantId : null,
    );
    hasSeededRef.current = true;
  }, [restaurantsMap, restaurantsHydrated, getRestaurant, merchant.key, merchant.merchantId]);

  const selectedRestaurant =
    selectedRestaurantId != null ? getRestaurant(selectedRestaurantId) : null;

  // Revoke object URLs on unmount or replacement so we don't leak.
  useEffect(() => {
    return () => {
      if (qrRender) URL.revokeObjectURL(qrRender.url);
    };
  }, [qrRender]);

  const canGenerate = selected !== null && !selected.dirty && selectedConfig !== null;

  const handleGenerate = (regeneratePassword: boolean) => {
    if (!canGenerate || !selectedConfig || !selected) return;
    try {
      const issuedAt = new Date().toISOString();
      const profile = selectedRestaurant?.profile;
      const assignment = assignments.upsertAssignment({
        merchant,
        config: selectedConfig,
        itemConfigCid: selected.cid,
        adminPublicKey,
        regeneratePassword,
        nowIso: issuedAt,
        payloadVersion: 2,
      });
      const payload = buildT3rminalConfigPayloadV2({
        merchant,
        config: selectedConfig,
        reportPassword: assignment.reportPassword,
        issuedAt,
        profile,
      });
      const { ur, qrString, byteLength } = encodeT3rminalConfigPayloadV2(payload);
      const upperBytes = TEXT_ENCODER.encode(qrString);
      // `qrModuleCount` throws when the message exceeds even the
      // largest QR version (Low EC ~ 2953 bytes). Treat that as
      // "too dense" so we fall straight into the multipart path.
      let moduleCount: number;
      try {
        moduleCount = qrModuleCount(upperBytes, CorrectionLevel.Low);
      } catch {
        moduleCount = Number.POSITIVE_INFINITY;
      }

      if (qrRender) URL.revokeObjectURL(qrRender.url);

      if (moduleCount <= DEFAULT_MAX_MODULES) {
        const rendered = renderUrQr(
          qrString,
          CorrectionLevel.Low,
          320,
          Color.BLACK,
          Color.WHITE,
          1,
          null,
        );
        const blob = new Blob([rendered.toPng().slice()], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        setQrRender({ url, mode: "static", byteLength, moduleCount, partsCount: null });
      } else {
        const frames = generateFrames(ur, {
          correction: CorrectionLevel.Low,
          size: 320,
          foreground: Color.BLACK,
          background: Color.WHITE,
          quietZone: 1,
          fps: ANIMATED_QR_FPS,
          maxModules: DEFAULT_MAX_MODULES,
        });
        const gifBytes = encodeAnimatedGif(frames, ANIMATED_QR_FPS);
        const blob = new Blob([gifBytes.slice()], { type: "image/gif" });
        const url = URL.createObjectURL(blob);
        setQrRender({
          url,
          mode: "animated",
          byteLength,
          moduleCount,
          partsCount: frames.length,
        });
      }
      setPayloadUr(qrString);
      setGeneratedAssignment(assignment);
      setGeneratedProfile(profile ?? null);
      setQrError(null);
    } catch (caught) {
      setQrError(caught instanceof Error ? caught.message : String(caught));
      if (qrRender) URL.revokeObjectURL(qrRender.url);
      setQrRender(null);
      setPayloadUr(null);
    }
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 10,
        }}
      >
        <AGhost onClick={onBack}>
          <Icon name="chevron-left" size={14} /> Back
        </AGhost>
        <span
          onClick={() => copyValue(merchant.terminalId, `terminal-id:${merchant.key}`)}
          title={merchant.terminalId}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              copyValue(merchant.terminalId, `terminal-id:${merchant.key}`);
            }
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            minWidth: 0,
            maxWidth: "60%",
            color:
              copiedField === `terminal-id:${merchant.key}` ? COLOR.greenSoft : COLOR.muted,
            transition: "color .15s",
          }}
        >
          <AMono size={11} color="inherit">
            <span
              style={{
                display: "inline-block",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                verticalAlign: "bottom",
              }}
            >
              {merchant.terminalId}
            </span>
          </AMono>
          <Icon
            name={copiedField === `terminal-id:${merchant.key}` ? "check" : "copy"}
            size={11}
          />
        </span>
      </div>
      <AEye>Configure T3rminal</AEye>
      <h1
        style={{
          fontFamily: FONT.serif,
          fontWeight: 400,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          fontSize: 32,
          margin: "6px 0 12px",
        }}
      >
        {merchant.name}
      </h1>

      <ACard padding={14}>
        <CopyableRow
          label="Payout destination"
          value={merchant.destinationSs58}
          mono
          copyField={`payout-ss58:${merchant.key}`}
        />
        <CopyableRow
          label="Terminal key"
          value={merchant.key}
          mono
          copyField={`terminal-key:${merchant.key}`}
          noBorder
        />
      </ACard>

      <div style={{ height: 14 }} />

      <AEye>Item config</AEye>
      {publishable.length === 0 ? (
        <ACard padding={14} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: COLOR.text3, lineHeight: 1.5 }}>
            No published item configs are available yet. Open the Items tab,
            create or edit a config, then tap "Save & publish" to upload it to
            Bulletin Chain.
          </div>
        </ACard>
      ) : (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {publishable.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedId(row.id)}
              style={{
                background: COLOR.surface,
                border: `1px solid ${row.id === selectedId ? COLOR.text2 : COLOR.border}`,
                borderRadius: 12,
                padding: "12px 14px",
                fontFamily: "inherit",
                fontSize: 13,
                color: COLOR.text,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 500 }}>{row.name}</span>
                <AMono size={10} color={COLOR.faint}>{row.id}</AMono>
              </div>
              <AMono size={10} color={COLOR.muted} title={row.cid}>{shortAddr(row.cid, 10, 8)}</AMono>
              {row.dirty ? (
                <div style={{ fontSize: 11, color: COLOR.redSoft }}>
                  Unsaved local changes — Save &amp; publish from Items first.
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}

      <div style={{ height: 14 }} />

      <AEye>Restaurant profile</AEye>
      <ACard padding={14} style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: COLOR.muted, lineHeight: 1.5, marginBottom: 12 }}>
          Pick a restaurant saved on this device. Its name, address,
          phone, and tax id are embedded inline in the QR and printed
          on every receipt this T3rminal issues. Manage the catalogue
          from the <strong>Restaurants</strong> tab; the matching id
          for <AMono size={11} color={COLOR.text2}>{merchant.merchantId}</AMono> is
          pre-selected by default when present.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <RestaurantPickerRow
            key="__none"
            selected={selectedRestaurantId === null}
            title="Don't embed a restaurant profile"
            subtitle="QR generates without the optional profile sub-map. Receipts will not carry a header."
            mono=""
            onClick={() => setSelectedRestaurantId(null)}
          />
          {restaurantList.map((r) => {
            const subtitleParts = [r.profile.addressLine1, r.profile.addressLine2].filter(Boolean);
            return (
              <RestaurantPickerRow
                key={r.id}
                selected={selectedRestaurantId === r.id}
                title={r.profile.name}
                subtitle={subtitleParts.join(" · ")}
                mono={r.id}
                onClick={() => setSelectedRestaurantId(r.id)}
              />
            );
          })}
        </div>
        <div style={{ height: 10 }} />
        <ASecondary
          onClick={onNewRestaurant}
          icon={<Icon name="plus" size={13} />}
        >
          New restaurant
        </ASecondary>
      </ACard>

      <div style={{ height: 14 }} />

      <APrimary onClick={() => handleGenerate(false)} disabled={!canGenerate}>
        <Icon name="check" size={13} />{" "}
        {generatedAssignment == null ? "Generate QR" : "Update QR (keep password)"}
      </APrimary>
      <div style={{ height: 8 }} />
      <ASecondary
        onClick={() => handleGenerate(true)}
        disabled={!canGenerate}
        icon={<Icon name="copy" size={13} />}
      >
        Regenerate password
      </ASecondary>

      {qrError ? (
        <div style={{ marginTop: 12, fontSize: 12, color: COLOR.redSoft }}>
          {qrError}
        </div>
      ) : null}

      {qrRender ? (
        <>
          <div style={{ height: 16 }} />
          <ACard padding={14}>
            <AEye>
              {qrRender.mode === "static" ? "Static QR" : "Animated multipart QR"}
            </AEye>
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
              <img
                src={qrRender.url}
                alt={`T3rminal QR for ${merchant.name}`}
                width={320}
                height={320}
                style={{ width: 320, height: 320, imageRendering: "pixelated" }}
              />
            </div>
            <ADotted margin={10} />
            <CopyableRow
              label="Issued"
              value={generatedAssignment?.issuedAt ?? ""}
              copyField={`qr-issued:${merchant.key}`}
            />
            <CopyableRow
              label="Receiving"
              value={generatedAssignment?.receivingAddress ?? ""}
              mono
              copyField={`qr-receiving:${merchant.key}`}
            />
            <CopyableRow
              label="Item config"
              value={generatedAssignment?.itemConfigId ?? ""}
              copyField={`qr-item-config-id:${merchant.key}`}
            />
            <CopyableRow
              label="Config CID"
              value={generatedAssignment?.itemConfigCid ?? ""}
              mono
              copyField={`qr-item-config-cid:${merchant.key}`}
            />

            <CopyableRow
              label="Password scheme"
              value={generatedAssignment?.passwordScheme ?? ""}
              mono
              copyField={`qr-password-scheme:${merchant.key}`}
              noBorder
            />
            {generatedProfile ? (
              <>
                <ADotted margin={10} />
                <CopyableRow
                  label="Restaurant"
                  value={generatedProfile.name}
                  copyField={`qr-profile-name:${merchant.key}`}
                />
                {generatedProfile.addressLine1 ? (
                  <CopyableRow
                    label="Address 1"
                    value={generatedProfile.addressLine1}
                    copyField={`qr-profile-addr1:${merchant.key}`}
                  />
                ) : null}
                {generatedProfile.addressLine2 ? (
                  <CopyableRow
                    label="Address 2"
                    value={generatedProfile.addressLine2}
                    copyField={`qr-profile-addr2:${merchant.key}`}
                  />
                ) : null}
                {generatedProfile.phone ? (
                  <CopyableRow
                    label="Phone"
                    value={generatedProfile.phone}
                    copyField={`qr-profile-phone:${merchant.key}`}
                  />
                ) : null}
                {generatedProfile.taxId ? (
                  <CopyableRow
                    label="Tax / VAT ID"
                    value={generatedProfile.taxId}
                    copyField={`qr-profile-taxid:${merchant.key}`}
                    noBorder
                  />
                ) : null}
              </>
            ) : (
              <div style={{ marginTop: 10, fontSize: 11, color: COLOR.faint, lineHeight: 1.5 }}>
                No restaurant profile embedded — add a name above to include one.
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 11, color: COLOR.muted, lineHeight: 1.5 }}>
              T3rminal scans this QR once and bootstraps the full item config
              and restaurant profile from the embedded payload — no Bulletin
              fetch, no registry call.
            </div>
          </ACard>

          {payloadUr ? (
            <>
              <div style={{ height: 10 }} />
              <ASecondary
                onClick={() => copyValue(payloadUr, `qr-payload:${merchant.key}`)}
                icon={
                  <Icon
                    name={copiedField === `qr-payload:${merchant.key}` ? "check" : "copy"}
                    size={13}
                  />
                }
              >
                {copiedField === `qr-payload:${merchant.key}` ? "Copied payload" : "Copy payload UR"}
              </ASecondary>
              <div style={{ marginTop: 6, fontSize: 10, color: COLOR.faint }}>
                {qrRender.mode === "static"
                  ? `Static QR — ${qrRender.byteLength} byte UR, ${qrRender.moduleCount} modules`
                  : `Animated QR — ${qrRender.byteLength} byte UR, ${qrRender.partsCount ?? 0} fountain frames`}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function Guard({ onBack, message }: { onBack: () => void; message: string }) {
  return (
    <>
      <AGhost onClick={onBack}>
        <Icon name="chevron-left" size={14} /> Back
      </AGhost>
      <div style={{ marginTop: 24, color: COLOR.muted, fontSize: 13 }}>{message}</div>
    </>
  );
}

interface RestaurantPickerRowProps {
  selected: boolean;
  title: string;
  subtitle: string;
  mono: string;
  onClick: () => void;
}

function RestaurantPickerRow({
  selected,
  title,
  subtitle,
  mono,
  onClick,
}: RestaurantPickerRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: COLOR.surface,
        border: `1px solid ${selected ? COLOR.text2 : COLOR.border}`,
        borderRadius: 12,
        padding: "12px 14px",
        fontFamily: "inherit",
        fontSize: 13,
        color: COLOR.text,
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {title}
        </span>
        {mono.length > 0 ? <AMono size={10} color={COLOR.faint}>{mono}</AMono> : null}
      </div>
      {subtitle.length > 0 ? (
        <div style={{ fontSize: 11, color: COLOR.muted, lineHeight: 1.4 }}>{subtitle}</div>
      ) : null}
    </button>
  );
}
