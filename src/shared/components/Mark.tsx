/**
 * W3sPay wordmark — a filled ring with a smaller filled dot.
 * Ported from `screens-shared.jsx::Mark`.
 */

export interface MarkProps {
  size?: number;
  dot?: string;
  ring?: string;
}

export function Mark({ size = 22, dot = "#0f0f0f", ring = "#fafaf9" }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill={ring} />
      <circle cx="32" cy="32" r="9" fill={dot} />
    </svg>
  );
}
