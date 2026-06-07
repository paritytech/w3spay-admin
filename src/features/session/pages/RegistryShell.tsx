import type { MerchantRegistryReadState } from "@features/merchant/contracts/merchant-queries.ts";

export function RegistryShell({ registry }: { registry: MerchantRegistryReadState }) {
  if (registry.kind === "loading") {
    return <div style={{ padding: 24, color: "#a8a29e", fontSize: 13 }}>Loading registry…</div>;
  }
  if (registry.kind === "config-error") {
    return (
      <div style={{ padding: 24, color: "#fca5a5", fontSize: 13 }}>
        Registry not configured: {registry.reason}
      </div>
    );
  }
  if (registry.kind === "error") {
    return (
      <div style={{ padding: 24, color: "#fca5a5", fontSize: 13 }}>
        Could not load registry: {registry.reason}
      </div>
    );
  }
  return null;
}
