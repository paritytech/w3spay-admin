import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("W3SPayMerchantRegistry", (m) => {
  const registry = m.contract("W3SPayMerchantRegistry");
  return { registry };
});
