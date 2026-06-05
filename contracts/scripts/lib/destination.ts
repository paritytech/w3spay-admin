import { ethers } from "ethers";

const ACCOUNT_ID32_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Normalize a merchant payout destination to the contract's canonical
 * AccountId32 bytes32 value.
 *
 * Operators should prefer pasting a 32-byte AccountId. For legacy revive/H160
 * destinations, the helper preserves the existing convention:
 * `0x00 × 12 ‖ H160`.
 */
export function parseDestinationAccountId(raw: string): string {
  const trimmed = raw.trim();
  if (ACCOUNT_ID32_RE.test(trimmed)) {
    const normalized = trimmed.toLowerCase();
    if (normalized === ethers.ZeroHash) {
      throw new Error("destination AccountId32 cannot be all zeroes");
    }
    return normalized;
  }

  if (ethers.isAddress(trimmed)) {
    const normalized = ethers.zeroPadValue(ethers.getAddress(trimmed), 32).toLowerCase();
    if (normalized === ethers.ZeroHash) {
      throw new Error("destination H160 cannot be the zero address");
    }
    return normalized;
  }

  throw new Error(
    `destination must be a 0x-prefixed AccountId32 (32 bytes) or H160 address, got: ${raw}`
  );
}

export function formatStatus(status: bigint | number): string {
  switch (Number(status)) {
    case 0:
      return "Active";
    case 1:
      return "Paused";
    case 2:
      return "Revoked";
    default:
      return `Unknown(${status})`;
  }
}

export function parseMerchantStatus(raw: string): 0 | 1 | 2 {
  switch (raw.trim().toLowerCase()) {
    case "active":
    case "0":
      return 0;
    case "paused":
    case "pause":
    case "1":
      return 1;
    case "revoked":
    case "revoke":
    case "2":
      return 2;
    default:
      throw new Error("status must be one of active, paused, revoked");
  }
}

