/**
 * Editorial screen primitives shared by every admin tab.
 *
 * Ported from `admin-ui.jsx` in the design bundle. The vocabulary mirrors
 * the cashier-facing w3spay surface (DM Serif headlines, JetBrains Mono
 * tabular numbers, stone palette) but tightened for an admin tool — denser
 * cards, tab rail, soft borders instead of shadows.
 *
 * Barrel: each primitive lives in its own file under `./primitives/`. This
 * module preserves the previous `from "./primitives.tsx"` import path
 * for every callsite.
 */

export { AFrame, type AFrameProps } from "@shared/components/primitives/AFrame.tsx";
export { ARail, type ARailProps } from "@shared/components/primitives/ARail.tsx";
export { ATabs, type ATabsProps, type TabItem } from "@shared/components/primitives/ATabs.tsx";
export { AHead, type AHeadProps } from "@shared/components/primitives/AHead.tsx";
export { AEye, type AEyeProps } from "@shared/components/primitives/AEye.tsx";
export {
  APrimary,
  ASecondary,
  AGhost,
  type APrimaryProps,
  type ASecondaryProps,
  type AGhostProps,
} from "@shared/components/primitives/buttons.tsx";
export {
  AField,
  AInput,
  ATextarea,
  type AFieldProps,
  type AInputProps,
  type ATextareaProps,
} from "@shared/components/primitives/inputs.tsx";
export { AStatus, type AStatusProps } from "@shared/components/primitives/AStatus.tsx";
export { ACard, type ACardProps } from "@shared/components/primitives/ACard.tsx";
export { ADotted, type ADottedProps } from "@shared/components/primitives/ADotted.tsx";
export { AMono, type AMonoProps } from "@shared/components/primitives/AMono.tsx";
export type { Density } from "@shared/components/primitives/Density.ts";
