// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * The payment-processor report document — the cross-app wire contract for
 * X/Z reports published by `w3s-payment-processor`.
 */

export const PROCESSOR_REPORT_FORMAT = "w3s-processor-report";
export const PROCESSOR_REPORT_VERSION = 1;

export interface ReportLine {
  readonly terminalId: string;
  readonly payoutHex: string;
  /** Sum of credits to this terminal in the period, integer planck as string. */
  readonly totalPlanck: string;
  readonly count: number;
}

/** One payment line item — a single recorded payment on either rail. */
export interface ReportPayment {
  readonly paymentId: string;
  readonly terminalId: string;
  readonly amountPlanck: string;
  readonly blockNumber?: number;
  readonly observedAtMs: number;
  readonly fromHex?: string;
}

export interface ProcessorReportDoc {
  readonly format: "w3s-processor-report";
  readonly version: 1;
  readonly kind: "x" | "z";
  readonly groupId: string;
  /** Display metadata so amounts format without the (encrypted) config bundle. */
  readonly token: { readonly symbol: string; readonly decimals: number };
  readonly generatedAtMs: number;
  /** Z only; omitted for X. */
  readonly seq?: number;
  readonly fromBlock: number;
  readonly toBlock: number;
  readonly lines: ReadonlyArray<ReportLine>;
  readonly grandTotalPlanck: string;
  readonly count: number;
  /** Each line item = one payment. Sorted by blockNumber asc, then paymentId asc. */
  readonly payments: ReadonlyArray<ReportPayment>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLine(raw: unknown): ReportLine | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.terminalId !== "string") return null;
  if (typeof raw.payoutHex !== "string") return null;
  if (typeof raw.totalPlanck !== "string") return null;
  if (typeof raw.count !== "number") return null;
  return {
    terminalId: raw.terminalId,
    payoutHex: raw.payoutHex,
    totalPlanck: raw.totalPlanck,
    count: raw.count,
  };
}

function parsePayment(raw: unknown): ReportPayment | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.paymentId !== "string") return null;
  if (typeof raw.terminalId !== "string") return null;
  if (typeof raw.amountPlanck !== "string") return null;
  if (raw.blockNumber !== undefined && typeof raw.blockNumber !== "number") return null;
  if (typeof raw.observedAtMs !== "number") return null;
  return {
    paymentId: raw.paymentId,
    terminalId: raw.terminalId,
    amountPlanck: raw.amountPlanck,
    ...(typeof raw.blockNumber === "number" ? { blockNumber: raw.blockNumber } : {}),
    observedAtMs: raw.observedAtMs,
    ...(typeof raw.fromHex === "string" ? { fromHex: raw.fromHex } : {}),
  };
}

/**
 * Fail-closed structural validation of a decrypted report payload. Returns
 * `null` on any hard failure — including a `groupId` other than the group the
 * caller fetched the report for (a cross-group payload is a wrong document,
 * not a display problem).
 */
export function parseProcessorReportDoc(
  raw: unknown,
  expectedGroupId: string,
): ProcessorReportDoc | null {
  if (!isRecord(raw)) return null;
  if (raw.format !== PROCESSOR_REPORT_FORMAT) return null;
  if (raw.version !== PROCESSOR_REPORT_VERSION) return null;
  if (raw.kind !== "x" && raw.kind !== "z") return null;
  if (raw.groupId !== expectedGroupId) return null;
  if (typeof raw.generatedAtMs !== "number") return null;
  if (typeof raw.fromBlock !== "number") return null;
  if (typeof raw.toBlock !== "number") return null;
  if (typeof raw.count !== "number") return null;
  if (typeof raw.grandTotalPlanck !== "string") return null;
  if (!isRecord(raw.token)) return null;
  if (typeof raw.token.symbol !== "string" || typeof raw.token.decimals !== "number") return null;
  if (!Array.isArray(raw.lines)) return null;
  const lines: ReportLine[] = [];
  for (const entry of raw.lines) {
    const line = parseLine(entry);
    if (line == null) return null;
    lines.push(line);
  }
  // Tolerant: missing/non-array payments → []; malformed entries dropped.
  const payments: ReportPayment[] = [];
  if (Array.isArray(raw.payments)) {
    for (const entry of raw.payments) {
      const payment = parsePayment(entry);
      if (payment != null) payments.push(payment);
    }
  }
  return {
    format: PROCESSOR_REPORT_FORMAT,
    version: PROCESSOR_REPORT_VERSION,
    kind: raw.kind,
    groupId: expectedGroupId,
    token: { symbol: raw.token.symbol, decimals: raw.token.decimals },
    generatedAtMs: raw.generatedAtMs,
    ...(typeof raw.seq === "number" ? { seq: raw.seq } : {}),
    fromBlock: raw.fromBlock,
    toBlock: raw.toBlock,
    lines,
    grandTotalPlanck: raw.grandTotalPlanck,
    count: raw.count,
    payments,
  };
}

/**
 * Format a planck amount using the token metadata embedded in the report —
 * the group's token may differ from the admin's own `envConfig.token`. Trims
 * trailing zeros but keeps ≥2 fraction places (currency feel), then appends
 * the symbol. Falls back to the raw string when the amount doesn't parse.
 */
export function formatReportAmount(
  amountPlanck: string,
  token: { readonly symbol: string; readonly decimals: number },
): string {
  try {
    const scale = 10n ** BigInt(token.decimals);
    const planck = BigInt(amountPlanck);
    const whole = planck / scale;
    const fraction = planck % scale;
    const fractionStr = (fraction < 0n ? -fraction : fraction)
      .toString()
      .padStart(token.decimals, "0");
    const trimmed = fractionStr.replace(/0+$/, "");
    const padded = trimmed.length < 2 ? trimmed.padEnd(2, "0") : trimmed;
    return `${whole.toString()}.${padded} ${token.symbol}`;
  } catch {
    return amountPlanck;
  }
}

function escCsv(value: string): string {
  return value.includes(",") || value.includes('"') || value.includes("\n")
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

/** Plain decimal token-unit string (BigInt split, trailing zeros trimmed) — no symbol. */
function planckToDecimal(amountPlanck: string, decimals: number): string {
  try {
    const scale = 10n ** BigInt(decimals);
    const planck = BigInt(amountPlanck);
    const whole = planck / scale;
    const fraction = (planck % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
    return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
  } catch {
    return amountPlanck;
  }
}

/**
 * Spreadsheet export — one CSV row per payment line item, mirroring the
 * processor app's own CSV columns byte-for-byte so books reconcile across
 * both apps. Coin payments carry no block number (empty cell).
 */
export function processorReportToCsv(doc: ProcessorReportDoc): string {
  const header = "payment_id,terminal_id,amount,token,amount_planck,block_number,observed_at,payer";
  const rows = doc.payments.map((p) =>
    [
      p.paymentId,
      p.terminalId,
      planckToDecimal(p.amountPlanck, doc.token.decimals),
      doc.token.symbol,
      p.amountPlanck,
      p.blockNumber != null ? String(p.blockNumber) : "",
      new Date(p.observedAtMs).toISOString(),
      p.fromHex ?? "",
    ]
      .map(escCsv)
      .join(","),
  );
  return [header, ...rows].join("\n");
}
