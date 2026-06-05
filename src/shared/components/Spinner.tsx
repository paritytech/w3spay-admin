/**
 * Visual loading indicator for in-flight reads.
 *
 * Pairs with the `w3-spin` keyframe in `styles.css`. The SVG draws a partial
 * arc (¾ circle) so the rotation is visible — a full circle would spin
 * imperceptibly. Renders inline so it can sit next to text/amounts without
 * extra wrapper boxes; callers control vertical alignment via flex layout.
 */

import { COLOR } from "./tokens.ts";

export interface SpinnerProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Accessible label. Defaults to "Loading". */
  label?: string;
}

export function Spinner({
  size = 14,
  color = COLOR.muted,
  strokeWidth = 2,
  label = "Loading",
}: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      style={{
        display: "inline-block",
        flexShrink: 0,
        animation: "w3-spin 0.9s linear infinite",
      }}
      role="img"
      aria-label={label}
    >
      <path d="M12 3a9 9 0 1 1-6.364 2.636" />
    </svg>
  );
}
