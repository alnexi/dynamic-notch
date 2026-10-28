import { ExpansionMode } from "../types/tasks";

/**
 * Nova Island — Smart Capsule Geometry & Expansion Math (v0.4.0)
 */

/**
 * Expansion factor for Nova Island capsule upon user click.
 * Target expanded width: approximately 3.5 times the current collapsed width.
 */
export const EXPANSION_FACTOR = 3.5;

/**
 * Media Island expanded dimensions.
 * Large enough for 48x48 rounded album artwork on the left, track details and controls in the center,
 * and clock/status on the right.
 */
export const MEDIA_EXPANDED_WIDTH = 400;
export const MEDIA_EXPANDED_HEIGHT = 60;
export const COLLAPSED_HEIGHT = 34;

/**
 * Screen bezel safety margin in CSS pixels to prevent the capsule from clipping
 * or bleeding off the monitor edge.
 */
export const SCREEN_MARGIN = 10;

/**
 * Calculates the collapsed width based on active task count.
 * - 0 tasks (clock only): 92px
 * - 1 task: 136px
 * - 2 tasks: 172px
 * - 3+ tasks: 208px
 */
export function getCollapsedWidth(activeTaskCount: number): number {
  switch (activeTaskCount) {
    case 0:
      return 92;
    case 1:
      return 136;
    case 2:
      return 172;
    default:
      return 208;
  }
}

export interface CapsuleGeometry {
  width: number;
  height: number;
  centerX: number;
  left: number;
  right: number;
}

/**
 * Intelligently computes the capsule geometry:
 * - Collapsed state: centered at anchorX, clamped within screen margins.
 * - Expanded state:
 *   - Standard mode: 3.5x collapsed width, 34px height.
 *   - Media mode: 400px width, 60px height.
 *   - Symmetrical around anchorX when sufficient room exists on both sides.
 *   - Near left corner: uses available left room, expands primarily to the right, strictly avoiding boundary clipping.
 *   - Near right corner: uses available right room, expands primarily to the left, strictly avoiding boundary clipping.
 */
export function computeCapsuleGeometry(
  anchorX: number,
  activeTaskCount: number,
  isExpanded: boolean,
  monitorWidth: number,
  expansionMode: ExpansionMode = "standard"
): CapsuleGeometry {
  const safeMonWidth = Math.max(monitorWidth, 800);
  const collapsedWidth = getCollapsedWidth(activeTaskCount);

  if (!isExpanded || expansionMode === "none") {
    const halfW = collapsedWidth / 2;
    const clampedCenter = Math.max(
      SCREEN_MARGIN + halfW,
      Math.min(safeMonWidth - SCREEN_MARGIN - halfW, anchorX)
    );
    return {
      width: collapsedWidth,
      height: COLLAPSED_HEIGHT,
      centerX: clampedCenter,
      left: clampedCenter - halfW,
      right: clampedCenter + halfW,
    };
  }

  // Expanded state: either standard (3.5x) or media player mode
  const targetWidth = expansionMode === "media"
    ? Math.min(MEDIA_EXPANDED_WIDTH, safeMonWidth - 2 * SCREEN_MARGIN)
    : Math.min(
        Math.round(collapsedWidth * EXPANSION_FACTOR),
        safeMonWidth - 2 * SCREEN_MARGIN
      );

  const targetHeight = expansionMode === "media" ? MEDIA_EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
  const halfW = targetWidth / 2;
  const minLeft = SCREEN_MARGIN;
  const maxRight = safeMonWidth - SCREEN_MARGIN;

  let left = anchorX - halfW;
  let right = anchorX + halfW;

  if (left < minLeft) {
    // Near left corner: pin to left margin and expand rightward
    left = minLeft;
    right = Math.min(minLeft + targetWidth, maxRight);
  } else if (right > maxRight) {
    // Near right corner: pin to right margin and expand leftward
    right = maxRight;
    left = Math.max(maxRight - targetWidth, minLeft);
  }

  const actualWidth = right - left;
  const centerX = (left + right) / 2;

  return {
    width: actualWidth,
    height: targetHeight,
    centerX,
    left,
    right,
  };
}
