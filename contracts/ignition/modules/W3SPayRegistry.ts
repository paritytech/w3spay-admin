import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("W3SPayRegistry", (m) => {
  const registry = m.contract("W3SPayRegistry");
  return { registry };
});
