// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Operator toggle between the two chain-read transports: the host bridge
 * (default) and the direct RPC WebSocket — the backup when the host's chain
 * connection is down. Signing always goes through the host wallet; outside a
 * host only direct RPC is viable, so the toggle is inert there.
 */

import { useState } from "react";

import { envConfig } from "@/config.ts";
import {
  getChainTransportMode,
  isInHost,
  resolveNetwork,
  setChainTransportMode,
  type ChainTransportMode,
} from "@shared/chain/host";
import { queryClient } from "@shared/chain/query-client.ts";
import { ACard, AEye, AMono } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";

export function NetworkTransportCard() {
  const inHost = isInHost();
  const [mode, setMode] = useState<ChainTransportMode>(getChainTransportMode());
  const showToast = useFeedbackStore((s) => s.showToast);
  const network = resolveNetwork(envConfig.chain.network);
  const active = inHost ? mode : "direct-ws";

  const options: ReadonlyArray<{
    mode: ChainTransportMode;
    label: string;
    detail: string;
  }> = [
    {
      mode: "host",
      label: "Polkadot host",
      detail: "Default — chain reads route through the host app's connection.",
    },
    {
      mode: "direct-ws",
      label: "Direct RPC",
      detail: `Backup — connects straight to ${network.mainChain.wsUrl}.`,
    },
  ];

  const select = (next: ChainTransportMode) => {
    if (!inHost || next === active) return;
    setChainTransportMode(next);
    setMode(next);
    void queryClient.invalidateQueries();
    showToast(
      next === "direct-ws"
        ? "Chain reads now use the direct RPC endpoint."
        : "Chain reads now route through the Polkadot host.",
    );
  };

  return (
    <ACard padding={16}>
      <AEye>Network connection</AEye>
      <div style={{ fontSize: 12, color: COLOR.muted, lineHeight: 1.5, marginBottom: 10 }}>
        How this console reads chain data. If one connection goes down, switch to the other —
        signing always goes through the host wallet.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((option) => {
          const selected = option.mode === active;
          return (
            <ACard
              key={option.mode}
              padding={12}
              onClick={inHost ? () => select(option.mode) : undefined}
              style={selected ? { borderColor: COLOR.blue } : undefined}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: COLOR.text, fontSize: 13 }}>{option.label}</span>
                {selected ? (
                  <AMono size={11} color={COLOR.blue}>
                    active
                  </AMono>
                ) : null}
              </div>
              <div style={{ fontSize: 11, color: COLOR.faint, marginTop: 2, lineHeight: 1.5 }}>
                {option.detail}
              </div>
            </ACard>
          );
        })}
      </div>
      {!inHost ? (
        <div style={{ fontSize: 11, color: COLOR.faint, marginTop: 8, lineHeight: 1.5 }}>
          Running outside a Polkadot host — direct RPC is the only available connection.
        </div>
      ) : null}
    </ACard>
  );
}
