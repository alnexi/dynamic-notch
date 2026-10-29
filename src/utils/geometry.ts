import { ExpansionMode } from "../types/tasks";

/**
 * Nova Island — Content-Adaptive Capsule Geometry & Expansion Math (v0.5.0)
 */

/**
 * Expansion factor for Nova Island standard capsule upon user click.
 * Target expanded width: approximately 3.5 times the current collapsed width.
 */
export const EXPANSION_FACTOR = 3.5;

/**
 * Bounds for content-adaptive Media Island dimensions.
 */
export const MEDIA_MIN_WIDTH = 280;
export const MEDIA_MAX_WIDTH = 560;
export const MEDIA_BASE_HEIGHT = 60;
export const MEDIA_WRAPPED_HEIGHT = 74;
export const COLLAPSED_HEIGHT = 34;
export const COLLAPSED_RADIUS = 17;

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

export interface MediaMetadataInput {
  title?: string;
  artist?: string;
  hasDuration?: boolean;
  rightTasksCount?: number;
}

export interface CapsuleGeometry {
  width: number;
  height: number;
  radius: number;
  titleLines: number;
  centerX: number;
  left: number;
  right: number;
}

let measurementCanvas: HTMLCanvasElement | null = null;

/**
 * Measures text width using an in-memory canvas (0.01ms, zero reflow, zero resize loops),
 * with a deterministic character-ratio fallback if canvas is unavailable.
 */
export function measureTextWidth(text: string, font: string, charFallbackRatio: number = 6.8): number {
  if (!text) return 0;
  if (typeof document !== "undefined") {
    try {
      if (!measurementCanvas) {
        measurementCanvas = document.createElement("canvas");
      }
      const ctx = measurementCanvas.getContext("2d");
      if (ctx) {
        ctx.font = font;
        return ctx.measureText(text).width;
      }
    } catch {
      // Fallback below
    }
  }
  return text.length * charFallbackRatio;
}

/**
 * Computes content-adaptive dimensions for the expanded Media Island:
 * - Accounts for 48x48 artwork, track title width, artist width, controls, progress track, clock, dividers, and padding.
 * - Short titles: compact, proportionate width (~280px-320px).
 * - Normal titles: appropriately scaled width (~340px-420px).
 * - Long titles: expands width up to 560px (clamped to monitor boundaries).
 * - If available width is constrained and title genuinely requires more space, wraps to 2 lines and expands height to 74px.
 * - Sophisticated rounded-rectangle radius: 20px (base 60px height) or 23px (74px height), completely eliminating oversized pill silhouettes.
 */
export function computeMediaDimensions(
  mediaInput: MediaMetadataInput | undefined,
  safeMonWidth: number
): { width: number; height: number; radius: number; titleLines: number } {
  const title = mediaInput?.title || "";
  const artist = mediaInput?.artist || "";
  const hasDuration = mediaInput?.hasDuration ?? false;
  const rightTasksCount = mediaInput?.rightTasksCount ?? 0;

  // Structural overhead:
  // Left pad (6) + Artwork (48) + Gap (10) + Controls padding (12) +
  // Gap (10) + Divider (1) + Divider margins (4) + Gap (10) +
  // Clock (46) + Secondary tasks (rightTasksCount * 22) + Right pad (10)
  const structuralWidth = 147 + rightTasksCount * 22;

  // Measure title and artist text widths
  const titleWidth = measureTextWidth(
    title,
    "600 11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    6.8
  );
  const artistWidth = measureTextWidth(
    artist,
    "400 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    5.6
  );

  // Minimum required content width for playback controls row & progress track
  const minControlsWidth = hasDuration ? 120 : 80;
  const maxContentTextWidth = Math.max(titleWidth, artistWidth);
  const neededControlsWidth = Math.max(maxContentTextWidth, minControlsWidth) + 12;

  const idealTotalWidth = Math.round(structuralWidth + neededControlsWidth);

  // Maximum allowable width on monitor with safety margins
  const maxMonitorAllowable = safeMonWidth - 2 * SCREEN_MARGIN;
  const maxTargetWidth = Math.min(MEDIA_MAX_WIDTH, maxMonitorAllowable);

  // Clamped target width
  let targetWidth = Math.max(MEDIA_MIN_WIDTH, Math.min(idealTotalWidth, maxTargetWidth));

  // Determine whether title fits on 1 line or needs wrapping to 2 lines
  const availableTextWidth = targetWidth - structuralWidth - 12;
  const titleNeedsWrapping = titleWidth > availableTextWidth;

  let targetHeight = MEDIA_BASE_HEIGHT;
  let titleLines = 1;

  if (titleNeedsWrapping) {
    // If screen space permits expanding width a bit more before wrapping, try to expand up to maxTargetWidth
    if (targetWidth < maxTargetWidth) {
      const expandedTarget = Math.min(maxTargetWidth, Math.round(structuralWidth + titleWidth + 16));
      targetWidth = Math.max(targetWidth, expandedTarget);
      const newAvail = targetWidth - structuralWidth - 12;
      if (titleWidth > newAvail) {
        targetHeight = MEDIA_WRAPPED_HEIGHT;
        titleLines = 2;
      }
    } else {
      // Width is already at maximum allowable; wrap title and increase height
      targetHeight = MEDIA_WRAPPED_HEIGHT;
      titleLines = 2;
    }
  }

  // Calculate sophisticated rounded-rectangle corner radius:
  // For 60px height: 20px radius.
  // For 74px height: 23px radius.
  // Proportional rounded rectangle rather than an elongated pill (which would be 30px / 37px)
  const radius = Math.round(Math.min(24, Math.max(18, targetHeight * 0.32)));

  return {
    width: targetWidth,
    height: targetHeight,
    radius,
    titleLines,
  };
}

/**
 * Intelligently computes the capsule geometry:
 * - Collapsed state: centered at anchorX, clamped within screen margins (radius 17px).
 * - Expanded state:
 *   - Standard mode: 3.5x collapsed width, 34px height, 17px radius.
 *   - Media mode: Content-adaptive width (280px-560px), content-adaptive height (60px-74px),
 *     proportional rounded-rectangle radius (20px-24px).
 *   - Symmetrical around anchorX when sufficient room exists on both sides.
 *   - Near left corner: pins to left margin and expands rightward, strictly avoiding clipping.
 *   - Near right corner: pins to right margin and expands leftward, strictly avoiding clipping.
 */
export function computeCapsuleGeometry(
  anchorX: number,
  activeTaskCount: number,
  isExpanded: boolean,
  monitorWidth: number,
  expansionMode: ExpansionMode = "standard",
  mediaInput?: MediaMetadataInput
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
      radius: COLLAPSED_RADIUS,
      titleLines: 1,
      centerX: clampedCenter,
      left: clampedCenter - halfW,
      right: clampedCenter + halfW,
    };
  }

  // Expanded state
  let targetWidth: number;
  let targetHeight: number;
  let radius: number;
  let titleLines = 1;

  if (expansionMode === "media") {
    const mediaDims = computeMediaDimensions(mediaInput, safeMonWidth);
    targetWidth = mediaDims.width;
    targetHeight = mediaDims.height;
    radius = mediaDims.radius;
    titleLines = mediaDims.titleLines;
  } else {
    targetWidth = Math.min(
      Math.round(collapsedWidth * EXPANSION_FACTOR),
      safeMonWidth - 2 * SCREEN_MARGIN
    );
    targetHeight = COLLAPSED_HEIGHT;
    radius = COLLAPSED_RADIUS;
  }

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
    radius,
    titleLines,
    centerX,
    left,
    right,
  };
}
