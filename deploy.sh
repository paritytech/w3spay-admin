#!/usr/bin/env bash
#
# deploy.sh - Build and deploy the W3sPay Admin SPA as a .dot product.
#
# Usage:
#   ./deploy.sh [name-or-domain]
#
# Defaults to "w3spayadmin.dot" if no name is given.
#
# Required env:
#   - MNEMONIC or DOTNS_MNEMONIC      Deploying account (12- or 24-word phrase).
#   - VITE_W3SPAY_REGISTRY_ADDRESS    Deployed W3SPayMerchantRegistry H160.
#                                     May also live in `apps/w3spay-admin/.env*`;
#                                     this script enforces it ahead of the build
#                                     so deploys never ship a bundle that boots
#                                     directly into the registry-not-configured
#                                     gate.
#   - VITE_NETWORK                    App chain key. Defaults to BULLETIN_ENV.
#
# Optional env:
#   - DOTNS_GATEWAY_BASE      Final gateway host suffix (default: dot.li).
#   - BULLETIN_ENV            bulletin-deploy --env id (default: paseo-next-v2).
#                             The app chain (VITE_NETWORK) MUST match this
#                             deployment env so reads, writes, and DotNS all
#                             target the same Paseo network.
#
# Mirror of `apps/w3spay/deploy.sh` so the two pilot surfaces deploy with
# the same conventions and tooling expectations.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/dist"
GATEWAY_BASE="${DOTNS_GATEWAY_BASE:-dot.li}"
BULLETIN_ENV="${BULLETIN_ENV:-paseo-next-v2}"
TARGET="${1:-w3spayadmin.dot}"
MIN_BULLETIN_DEPLOY_VERSION="0.8.0"

if [[ "$TARGET" != *.dot ]]; then
  TARGET="${TARGET}.dot"
fi

version_gte() {
  local current="$1"
  local minimum="$2"
  local current_major current_minor current_patch
  local minimum_major minimum_minor minimum_patch

  IFS=. read -r current_major current_minor current_patch <<<"$current"
  IFS=. read -r minimum_major minimum_minor minimum_patch <<<"$minimum"

  [[ "$current_major" =~ ^[0-9]+$ ]] || return 1
  [[ "$current_minor" =~ ^[0-9]+$ ]] || return 1
  [[ "$current_patch" =~ ^[0-9]+$ ]] || return 1

  if (( current_major != minimum_major )); then
    (( current_major > minimum_major ))
    return
  fi
  if (( current_minor != minimum_minor )); then
    (( current_minor > minimum_minor ))
    return
  fi
  (( current_patch >= minimum_patch ))
}

# Resolve VITE_W3SPAY_REGISTRY_ADDRESS from the shell env (highest
# priority) or one of the .env files Vite will load at build time
# (production-mode precedence: .env.production.local → .env.production →
# .env.local → .env). Emits the resolved value on stdout, or returns 1
# if nothing was found. Strips a single layer of surrounding double or
# single quotes from a literal env-file value; does NOT support inline
# `# comments` — `dotenv` treats those as part of the value too, so we
# stay consistent with Vite's loader.
resolve_registry_address() {
  if [[ -n "${VITE_W3SPAY_REGISTRY_ADDRESS:-}" ]]; then
    printf '%s' "$VITE_W3SPAY_REGISTRY_ADDRESS"
    return 0
  fi
  local envfile line value
  for envfile in .env.production.local .env.production .env.local .env; do
    [[ -f "$SCRIPT_DIR/$envfile" ]] || continue
    # `|| true` shields the pipeline from grep's non-zero "no match" exit
    # under `set -o pipefail`. Last entry wins inside a single file so
    # operator overrides at the bottom of the file take effect.
    line="$( (grep -E '^VITE_W3SPAY_REGISTRY_ADDRESS=' "$SCRIPT_DIR/$envfile" || true) | tail -n 1)"
    [[ -n "$line" ]] || continue
    value="${line#VITE_W3SPAY_REGISTRY_ADDRESS=}"
    # Trim surrounding whitespace.
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    # Strip a single layer of surrounding double or single quotes.
    if [[ "$value" == \"*\" ]]; then value="${value#\"}"; value="${value%\"}"; fi
    if [[ "$value" == \'*\' ]]; then value="${value#\'}"; value="${value%\'}"; fi
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  done
  return 1
}

if ! command -v bulletin-deploy >/dev/null 2>&1; then
  echo "Error: bulletin-deploy is required for current DotNS deployments."
  echo ""
  echo "Install it first:"
  echo "  npm install -g bulletin-deploy@latest"
  exit 1
fi

BULLETIN_DEPLOY_VERSION="$(bulletin-deploy --version | sed -E 's/.*v?([0-9]+[.][0-9]+[.][0-9]+).*/\1/')"
if ! version_gte "$BULLETIN_DEPLOY_VERSION" "$MIN_BULLETIN_DEPLOY_VERSION"; then
  echo "Error: bulletin-deploy ${MIN_BULLETIN_DEPLOY_VERSION} or newer is required for Paseo deployments."
  echo "Found: ${BULLETIN_DEPLOY_VERSION:-unknown}"
  echo ""
  echo "Update it first:"
  echo "  npm install -g bulletin-deploy@latest"
  echo ""
  echo "Versions before 0.7.12 do not support the current Bulletin authorization logic."
  exit 1
fi

# Resolve the deploying mnemonic. Sources in priority order:
#   1. Shell env vars (MNEMONIC or DOTNS_MNEMONIC) — highest priority
#   2. .env files in Vite precedence order:
#        .env.production.local → .env.production → .env.local → .env
#      Recognises both the MNEMONIC= and DOTNS_MNEMONIC= keys.
# Both variable names are accepted at every layer; they MUST agree when
# both are set in the same source. Store the mnemonic in .env.local
# (gitignored) rather than .env to avoid accidental commits.

# Helper: read and normalise a single key from an env file.
# Prints the value on stdout; returns 1 when the key is absent or empty.
# Strips one layer of surrounding quotes and collapses internal whitespace —
# same rules as Vite's dotenv loader.
_read_envfile_key() {
  local file="$1" key="$2" line value
  line="$( (grep -E "^${key}=" "$file" || true) | tail -n 1)"
  [[ -n "$line" ]] || return 1
  value="${line#"${key}="}"
  value="${value#"${value%%[![:space:]]*}"}"   # ltrim
  value="${value%"${value##*[![:space:]]}"}"   # rtrim
  if [[ "$value" == \"*\" ]]; then value="${value#\"}"; value="${value%\"}"; fi
  if [[ "$value" == \'*\' ]]; then value="${value#\'}"; value="${value%\'}"; fi
  value="$(printf '%s' "$value" | tr -s '[:space:]' ' ' | sed -E 's/^ //; s/ $//')"
  [[ -n "$value" ]] && printf '%s' "$value" || return 1
}

# 1. Normalise shell env vars and check for conflicts.
_dotns_norm="$(printf '%s' "${DOTNS_MNEMONIC:-}" | tr -s '[:space:]' ' ' | sed -E 's/^ //; s/ $//')"
_mnem_norm="$(printf '%s' "${MNEMONIC:-}" | tr -s '[:space:]' ' ' | sed -E 's/^ //; s/ $//')"

if [[ -n "$_dotns_norm" && -n "$_mnem_norm" && "$_dotns_norm" != "$_mnem_norm" ]]; then
  echo "Error: DOTNS_MNEMONIC and MNEMONIC are both set but contain different values."
  echo ""
  echo "This is almost always a stale export. Unset the one you do not want, then re-run:"
  echo "  unset DOTNS_MNEMONIC   # to use the MNEMONIC you just exported"
  echo "  unset MNEMONIC         # to use DOTNS_MNEMONIC instead"
  exit 1
fi

RAW_MNEMONIC="${_dotns_norm:-$_mnem_norm}"

# 2. Fall back to .env files when neither shell var is set.
if [[ -z "$RAW_MNEMONIC" ]]; then
  for _envfile in .env.production.local .env.production .env.local .env; do
    [[ -f "$SCRIPT_DIR/$_envfile" ]] || continue
    _f_dotns="$(_read_envfile_key "$SCRIPT_DIR/$_envfile" DOTNS_MNEMONIC || true)"
    _f_mnem="$(_read_envfile_key "$SCRIPT_DIR/$_envfile" MNEMONIC || true)"
    if [[ -n "$_f_dotns" && -n "$_f_mnem" && "$_f_dotns" != "$_f_mnem" ]]; then
      echo "Error: $_envfile sets both DOTNS_MNEMONIC and MNEMONIC to different values."
      echo "Remove one of them from $_envfile."
      exit 1
    fi
    RAW_MNEMONIC="${_f_dotns:-$_f_mnem}"
    if [[ -n "$RAW_MNEMONIC" ]]; then
      echo "==> Using mnemonic from ${_envfile}."
      break
    fi
  done
fi

if [[ -z "$RAW_MNEMONIC" ]]; then
  echo "Error: no mnemonic found. Provide one via:"
  echo ""
  echo "  export MNEMONIC=\"your twelve word mnemonic phrase here\""
  echo ""
  echo "  or add MNEMONIC=... to .env.local (gitignored — never commit it)."
  exit 1
fi

# Word-count sanity check: BIP-39 mnemonics are 12 or 24 words. Anything else
# is a paste accident — fail fast with a helpful message instead of letting
# `@polkadot/keyring` throw the opaque "Unable to match provided value to a
# secret URI" later.
WORD_COUNT="$(printf '%s' "$RAW_MNEMONIC" | awk '{print NF}')"
if [[ "$WORD_COUNT" != "12" && "$WORD_COUNT" != "24" ]]; then
  echo "Error: mnemonic has $WORD_COUNT words; expected 12 or 24."
  echo ""
  echo "Re-check the value you exported. The mnemonic must be the exact"
  echo "12- or 24-word phrase your wallet shows, separated by single spaces."
  exit 1
fi

export MNEMONIC="$RAW_MNEMONIC"

# Resolve and enforce VITE_W3SPAY_REGISTRY_ADDRESS BEFORE the build runs.
# A missing or malformed address would produce a bundle whose first paint
# is the registry-not-configured gate — silently bad for a deploy.
RESOLVED_REGISTRY_ADDRESS="$(resolve_registry_address || true)"
if [[ -z "$RESOLVED_REGISTRY_ADDRESS" ]]; then
  echo "Error: VITE_W3SPAY_REGISTRY_ADDRESS is not set."
  echo ""
  echo "Set it in the shell environment before running deploy:"
  echo "  export VITE_W3SPAY_REGISTRY_ADDRESS=0x…"
  echo ""
  echo "Or add it to apps/w3spay-admin/.env.local (gitignored):"
  echo "  VITE_W3SPAY_REGISTRY_ADDRESS=0x…"
  echo ""
  echo "Use the deployed contract address from:"
  echo "  apps/w3spay-admin/contracts/ignition/deployments/chain-420420417/deployed_addresses.json"
  echo ""
  echo "Skipping this variable would ship a bundle that lands directly on"
  echo "the registry-not-configured gate."
  exit 1
fi

# H160 shape check — 0x followed by exactly 40 hex characters. The admin
# loader normalizes case at runtime; we only reject obvious typos here.
if ! [[ "$RESOLVED_REGISTRY_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "Error: VITE_W3SPAY_REGISTRY_ADDRESS=\"$RESOLVED_REGISTRY_ADDRESS\" is not a valid H160 address."
  echo "Expected a 0x-prefixed 40-hex-character string."
  echo "Example: 0xA5e2Fe65C9A80fa246BACf339a0A4f293c1DabEb"
  exit 1
fi

# Re-export so the npm/vite child process sees the same value we
# validated, regardless of which env source it came from. Vite would
# load .env files itself, but exporting here keeps the build environment
# unambiguous and matches what we just printed.
export VITE_W3SPAY_REGISTRY_ADDRESS="$RESOLVED_REGISTRY_ADDRESS"
export VITE_NETWORK="${VITE_NETWORK:-$BULLETIN_ENV}"
case "$VITE_NETWORK" in
  paseo|paseo-next-v2|previewnet) ;;
  *)
    echo "Error: VITE_NETWORK=\"$VITE_NETWORK\" is not supported."
    echo "Expected one of: paseo, paseo-next-v2, previewnet."
    exit 1
    ;;
esac
if [[ "$VITE_NETWORK" != "$BULLETIN_ENV" ]]; then
  echo "Error: VITE_NETWORK=\"$VITE_NETWORK\" must match BULLETIN_ENV=\"$BULLETIN_ENV\" for deployment."
  echo "Set both to the same network before deploying."
  exit 1
fi
echo "==> Using registry: ${RESOLVED_REGISTRY_ADDRESS}"
echo "==> Using network: ${VITE_NETWORK}"
echo "==> Building W3sPay Admin SPA..."
npm --prefix "$SCRIPT_DIR" run build

echo "==> Copying dot.li manifest..."
cp "$SCRIPT_DIR/bundle/manifest.toml" "$BUILD_DIR/manifest.toml"

if [[ ! -f "$BUILD_DIR/manifest.toml" ]]; then
  echo "Error: manifest.toml was not copied into the build output."
  exit 1
fi

echo ""
echo "==> Deploying ${TARGET} to Paseo Next v2 (BULLETIN_ENV=${BULLETIN_ENV})..."
bulletin-deploy --publish --env "$BULLETIN_ENV" --mnemonic "$RAW_MNEMONIC" "$BUILD_DIR" "$TARGET"

NAME="${TARGET%.dot}"
echo ""
echo "==> Done! Live at:"
echo "    https://${NAME}.${GATEWAY_BASE}"
