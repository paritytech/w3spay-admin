/**
 * User-facing copy for the mutation-error union.
 *
 * Held in its own module so the orchestrator file stays under the
 * 200-line budget and so translators have one obvious place to look
 * when this surface is localised.
 */

import type { MutationError } from "@features/items/items-mutations.ts";

export function errorMessage(error: MutationError | null): string | null {
  if (!error) return null;
  switch (error.kind) {
    case "duplicate-config-id":
      return `Config ID "${error.id}" already exists. Pick another.`;
    case "invalid-id":
      return "Use lowercase letters, numbers, and dashes only.";
    case "not-found":
      return "Item not found — it may have been deleted elsewhere.";
  }
}
