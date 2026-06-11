// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { envConfig } from "@/config";

export function getAdminProductIdentifier(): string {
  return envConfig.host.productDotNs;
}
