// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Minimal RFC 4180 CSV helpers shared by the report exporters. Quote a cell
 * only when it carries a delimiter, quote, or newline; double any embedded
 * quotes. Inputs are already stringified by the caller.
 */
export function csvEscape(value: string): string {
  return value.includes(",") || value.includes('"') || value.includes("\n")
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

/** Join pre-stringified cells into one escaped CSV row. */
export function csvRow(cells: ReadonlyArray<string>): string {
  return cells.map(csvEscape).join(",");
}
