/**
 * Variant dispatcher for the access gate. Each `variant.kind` branch
 * renders the matching card (and, where relevant, the
 * `AdminAccountCard` below it so the maintainer can copy the H160 to
 * whitelist).
 */

import { ACard, AEye, APrimary, ASecondary } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import { AdminAccountCard } from "./AdminAccountCard.tsx";
import { Description } from "./Description.tsx";
import type { AdminAccessProps } from "./types.ts";

export function AccessBody(props: AdminAccessProps) {
  const { variant } = props;

  if (variant.kind === "outside-host") {
    return (
      <ACard padding={16}>
        <AEye>Host required</AEye>
        <Description>
          Open this app inside the Polkadot host (dotli, Polkadot Desktop,
          or the Polkadot mobile app) to sign in with your product account.
        </Description>
      </ACard>
    );
  }

  if (variant.kind === "pending" || variant.kind === "requesting" || variant.kind === "resolving") {
    return (
      <ACard padding={16}>
        <AEye>Connecting</AEye>
        <Description>
          {variant.kind === "requesting"
            ? "Approve the sign-in request in your host wallet."
            : "Resolving your product account…"}
        </Description>
      </ACard>
    );
  }

  if (variant.kind === "disconnected") {
    return (
      <ACard padding={16}>
        <AEye>Sign in required</AEye>
        <Description>
          Sign in through the host wallet to receive your admin grant
          address. The contract owner must whitelist that address before
          you can manage merchants.
        </Description>
        <div style={{ height: 12 }} />
        <APrimary onClick={props.onRequestAccess}>Request admin access</APrimary>
      </ACard>
    );
  }

  if (variant.kind === "checking-admin") {
    return (
      <>
        <ACard padding={16}>
          <AEye>Checking registry access</AEye>
          <Description>
            Your product account is resolved. Checking whether this H160 is
            whitelisted as a W3sPay registry admin…
          </Description>
          <div style={{ height: 12 }} />
          <ASecondary onClick={props.onCheckAgain} disabled={props.checkInFlight}>
            {props.checkInFlight ? "Checking…" : "Check again"}
          </ASecondary>
        </ACard>
        <div style={{ height: 12 }} />
        <AdminAccountCard identity={variant.identity} title="Resolved application account" />
      </>
    );
  }

  if (variant.kind === "registry-config-error") {
    return (
      <>
        <ACard padding={16}>
          <AEye color={COLOR.redSoft}>Registry not configured</AEye>
          <Description>
            {variant.reason} Set <code>VITE_W3SPAY_REGISTRY_ADDRESS</code> in
            the admin app environment and reload.
          </Description>
        </ACard>
        {variant.identity ? (
          <>
            <div style={{ height: 12 }} />
            <AdminAccountCard identity={variant.identity} title="Resolved application account" />
          </>
        ) : null}
      </>
    );
  }

  if (variant.kind === "registry-error") {
    return (
      <>
        <ACard padding={16}>
          <AEye color={COLOR.redSoft}>Could not contact registry</AEye>
          <Description>{variant.reason}</Description>
          <div style={{ height: 12 }} />
          <ASecondary onClick={props.onCheckAgain}>Try again</ASecondary>
        </ACard>
        {variant.identity ? (
          <>
            <div style={{ height: 12 }} />
            <AdminAccountCard identity={variant.identity} title="Resolved application account" />
          </>
        ) : null}
      </>
    );
  }

  if (variant.kind === "host-transport-unavailable") {
    return (
      <>
        <ACard padding={16}>
          <AEye color={COLOR.redSoft}>Host transport unavailable</AEye>
          <Description>
            The Polkadot host did not respond to a capability probe.
            {variant.reason ? ` ${variant.reason}.` : ""} Reopen this app from
            the host (dotli, Polkadot Desktop, or the mobile app) and try
            again.
          </Description>
          <div style={{ height: 12 }} />
          <ASecondary
            onClick={props.onRetryHostPermissions}
            disabled={props.permissionsRetryInFlight}
          >
            {props.permissionsRetryInFlight ? "Retrying…" : "Retry"}
          </ASecondary>
        </ACard>
        {variant.identity ? (
          <>
            <div style={{ height: 12 }} />
            <AdminAccountCard identity={variant.identity} title="Resolved application account" />
          </>
        ) : null}
      </>
    );
  }

  if (variant.kind === "chain-submit-denied") {
    return (
      <>
        <ACard padding={16}>
          <AEye color={COLOR.redSoft}>Transaction broadcast permission denied</AEye>
          <Description>
            The host denied permission to broadcast transactions
            (<code>ChainSubmit</code>).
            {variant.reason ? ` ${variant.reason}.` : ""} Grant the permission
            to register or update merchants.
          </Description>
          <div style={{ height: 12 }} />
          <APrimary
            onClick={props.onRetryHostPermissions}
            disabled={props.permissionsRetryInFlight}
          >
            {props.permissionsRetryInFlight ? "Requesting…" : "Re-request permission"}
          </APrimary>
        </ACard>
        <div style={{ height: 12 }} />
        <AdminAccountCard identity={variant.identity} title="Resolved application account" />
      </>
    );
  }

  if (variant.kind === "error") {
    return (
      <ACard padding={16}>
        <AEye color={COLOR.redSoft}>Could not load your account</AEye>
        <Description>{variant.reason}</Description>
        <div style={{ height: 12 }} />
        <ASecondary onClick={props.onCheckAgain}>Try again</ASecondary>
      </ACard>
    );
  }

  // not-admin
  return (
    <>
      <ACard padding={16}>
        <AEye>Not yet authorized</AEye>
        <Description>
          You are signed in, but this product account is not a registry
          admin. Send the H160 address below to the contract maintainer.
          They will whitelist it via{" "}
          <code>w3spay-add-registry-admin.ts</code>. Once granted, press{" "}
          <strong>Check again</strong>.
        </Description>
      </ACard>

      <div style={{ height: 12 }} />

      <AdminAccountCard
        identity={variant.identity}
        title="Send this H160 to the maintainer"
      />

      <div style={{ height: 16 }} />
      <APrimary onClick={props.onCheckAgain} disabled={props.checkInFlight}>
        {props.checkInFlight ? "Checking…" : "Check again"}
      </APrimary>
    </>
  );
}
