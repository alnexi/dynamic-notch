import type { ExpansionMode } from "../types/tasks";

/**
 * Nova Island — True Content-Adaptive Capsule Geometry & Expansion Math (v0.6.0)
 */

/**
 * Expansion factor for Nova Island standard capsule upon user click.
 * Target expanded width: approximately 3.5 times the current collapsed width.
 */
export const EXPANSION_FACTOR = 3.5;

/**
 * Bounds for content-adaptive Media Island dimensions.
 * Note: Width and height have NO arbitrary upper caps (such as the legacy 560px or 74px limits).
 * They adapt purely to actual rendered content, constrained only by monitor margins and corner geometry.
 */
export const MEDIA_MIN_WIDTH = 280;
export const MEDIA_BASE_HEIGHT = 60;
export const COLLAPSED_HEIGHT = 34;
export const COLLAPSED_RADIUS = 17;

/**
 * Standard vertical and left inset for the album artwork inside the media capsule.
 * With H = 60px, artwork size is 60 - 2 * 6 = 48px.
 * When the capsule grows taller (e.g. 74px, 88px, 96px), the artwork scales responsively (H - 2 * 6px),
 * maintaining perfectly balanced, equal top, bottom, and left spacing.
 */
export const MEDIA_VERTICAL_INSET = 6;
export const MEDIA_MIN_ARTWORK_SIZE = 48;

/**
 * Derives the responsive album artwork size from the capsule height:
 * - Square aspect ratio is preserved.
 * - Top and bottom insets remain exactly equal (MEDIA_VERTICAL_INSET = 6px).
 * - Minimum size is 48px (base 60px capsule height).
 */
export function getArtworkSize(capsuleHeight: number): number {
  return Math.max(MEDIA_MIN_ARTWORK_SIZE, Math.round(capsuleHeight - 2 * MEDIA_VERTICAL_INSET));
}

/**
 * Derives the proportional album artwork corner curvature:
 * - Base 48px artwork -> 10px radius (matching the approved v0.4.1/v0.5.0/v0.6.0 standard).
 * - Scales smoothly and concentrically as the artwork grows (e.g. 62px -> 13px, 76px -> 16px).
 * - Strictly avoids sharp right angles and over-rounded circular pill distortions.
 */
export function getArtworkRadius(artworkSize: number): number {
  return Math.round(Math.min(16, Math.max(10, artworkSize * 0.208)));
}

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

export interface MediaMeasuredDimensions {
  naturalTitleWidth?: number;
  naturalArtistWidth?: number;
  measuredControlsWidth?: number;
  measuredControlsHeight?: number;
  measuredRightWidth?: number;
}

export interface MediaMetadataInput {
  title?: string;
  artist?: string;
  hasDuration?: boolean;
  rightTasksCount?: number;
  measured?: MediaMeasuredDimensions;
  isPlayerPanelOpen?: boolean;
  isDeviceMenuOpen?: boolean;
  deviceCount?: number;
}

export interface CapsuleGeometry {
  width: number;
  height: number;
  radius: number;
  titleLines: number;
  centerX: number;
  left: number;
  right: number;
  artworkSize: number;
  artworkRadius: number;
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
 * - Uses true rendered DOM measurements when available; falls back to high-fidelity font metrics.
 * - Responsive album artwork sizing: derives artwork dimensions (H - 2 * 6px) and concentric corner curvature
 *   directly from the rendered capsule height.
 * - Short titles: compact, proportionate width (~280px-320px).
 * - Normal titles: appropriately scaled width (~340px-440px).
 * - Long titles: expands width dynamically (600px, 700px, 800px+) without premature arbitrary 560px capping,
 *   constrained only by monitor bezel margins and corner proximity.
 * - Dynamic height: removes arbitrary 74px ceiling; expands vertically (e.g. 74px, 84px, 96px) when title
 *   wraps onto multiple lines or content stack requires it.
 * - Proportional rounded-rectangle radius: 20px (base 60px height) scaling to 26px for taller heights,
 *   completely eliminating oversized pill silhouettes.
 */
export function computeMediaDimensions(
  mediaInput: MediaMetadataInput | undefined,
  safeMonWidth: number
): {
  width: number;
  height: number;
  radius: number;
  titleLines: number;
  artworkSize: number;
  artworkRadius: number;
} {
  const title = mediaInput?.title || "";
  const artist = mediaInput?.artist || "";
  const hasDuration = mediaInput?.hasDuration ?? false;
  const rightTasksCount = mediaInput?.rightTasksCount ?? 0;
  const measured = mediaInput?.measured;

  // Nova Island v0.7.0 — Professional Music Player Panel dimensions:
  // State B (panel open) & State C/D (device selection menu open)
  if (mediaInput?.isPlayerPanelOpen) {
    const targetWidth = Math.min(390, safeMonWidth - 2 * SCREEN_MARGIN);
    let targetHeight = 212;
    if (mediaInput.isDeviceMenuOpen) {
      const dCount = Math.max(1, mediaInput.deviceCount ?? 3);
      const listExtraHeight = Math.min(dCount * 36 + 14, 155);
      targetHeight += listExtraHeight;
    }
    return {
      width: targetWidth,
      height: targetHeight,
      radius: 26,
      titleLines: 1,
      artworkSize: 48,
      artworkRadius: 10,
    };
  }

  // Determine initial target height:
  // - If measuredControlsHeight is available from rendered DOM, derive height from content stack + padding (14px).
  // - Otherwise, start with MEDIA_BASE_HEIGHT (60px).
  let targetHeight = MEDIA_BASE_HEIGHT;
  if (typeof measured?.measuredControlsHeight === "number" && measured.measuredControlsHeight > 0) {
    const neededFromContent = Math.round(measured.measuredControlsHeight + 14);
    targetHeight = Math.max(MEDIA_BASE_HEIGHT, neededFromContent);
  }

  // Responsive artwork sizing derived directly from capsule height:
  // Artwork is square (aspect-ratio 1:1), vertically centered, with equal 6px top, bottom, and left margins.
  let artworkSize = getArtworkSize(targetHeight);
  let artworkRadius = getArtworkRadius(artworkSize);

  // Clock & Secondary tasks (measured or calculated)
  const measuredRight = measured?.measuredRightWidth;
  const rightSectionWidth = typeof measuredRight === "number" && measuredRight > 0
    ? measuredRight
    : 46 + rightTasksCount * 22;

  // Structural overhead:
  // Left pad (6) + Artwork (artworkSize) + Gap (10) + Controls padding (12) +
  // Gap (10) + Divider (1) + Divider margins (4) + Gap (10) +
  // Clock & Secondary tasks + Right pad (10)
  let structuralWidth = MEDIA_VERTICAL_INSET + artworkSize + 10 + 12 + 10 + 5 + 10 + rightSectionWidth + 10;

  // Natural unconstrained text widths: prefer DOM measured widths when available
  const titleWidth = typeof measured?.naturalTitleWidth === "number" && measured.naturalTitleWidth > 0
    ? measured.naturalTitleWidth
    : measureTextWidth(
        title,
        "600 11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        6.8
      );

  const artistWidth = typeof measured?.naturalArtistWidth === "number" && measured.naturalArtistWidth > 0
    ? measured.naturalArtistWidth
    : measureTextWidth(
        artist,
        "400 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        5.6
      );

  // Minimum required content width for playback controls row & progress track
  const minControlsWidth = typeof measured?.measuredControlsWidth === "number" && measured.measuredControlsWidth > 0
    ? measured.measuredControlsWidth
    : (hasDuration ? 120 : 80);

  const maxContentTextWidth = Math.max(titleWidth, artistWidth);
  const neededControlsWidth = Math.max(maxContentTextWidth, minControlsWidth) + 12;

  const idealTotalWidth = Math.round(structuralWidth + neededControlsWidth);

  // Maximum allowable width on monitor with safety margins (NO arbitrary 560px cap)
  const maxMonitorAllowable = safeMonWidth - 2 * SCREEN_MARGIN;

  // Clamped target width: can scale smoothly up to monitor width limit
  let targetWidth = Math.max(MEDIA_MIN_WIDTH, Math.min(idealTotalWidth, maxMonitorAllowable));

  // Determine whether title fits on 1 line or needs wrapping
  const availableTextWidth = targetWidth - structuralWidth - 12;
  const titleNeedsWrapping = titleWidth > availableTextWidth;

  let titleLines = 1;

  if (titleNeedsWrapping) {
    // If screen space permits expanding width a bit more before wrapping, try to expand up to maxMonitorAllowable
    if (targetWidth < maxMonitorAllowable) {
      const expandedTarget = Math.min(maxMonitorAllowable, Math.round(structuralWidth + titleWidth + 16));
      targetWidth = Math.max(targetWidth, expandedTarget);
      const newAvail = targetWidth - structuralWidth - 12;
      if (titleWidth > newAvail) {
        titleLines = titleWidth > newAvail * 1.85 ? 3 : 2;
      }
    } else {
      titleLines = titleWidth > availableTextWidth * 1.85 ? 3 : 2;
    }

    // If DOM controls height was not measured yet, update height based on wrapping lines:
    if (!measured?.measuredControlsHeight) {
      targetHeight = titleLines === 3 ? 88 : 74;
      artworkSize = getArtworkSize(targetHeight);
      artworkRadius = getArtworkRadius(artworkSize);
      structuralWidth = MEDIA_VERTICAL_INSET + artworkSize + 10 + 12 + 10 + 5 + 10 + rightSectionWidth + 10;
    }
  }

  // Calculate sophisticated rounded-rectangle corner radius:
  // 60px height -> 20px radius.
  // 74px height -> 21px radius.
  // 88px height -> 25px radius.
  // Proportional rounded rectangle rather than an elongated pill
  const radius = Math.round(Math.min(26, Math.max(20, targetHeight * 0.28)));

  return {
    width: targetWidth,
    height: targetHeight,
    radius,
    titleLines,
    artworkSize,
    artworkRadius,
  };
}

/**
 * Intelligently computes the capsule geometry:
 * - Collapsed state: centered at anchorX, clamped within screen margins (radius 17px).
 * - Expanded state:
 *   - Standard mode: 3.5x collapsed width, 34px height, 17px radius.
 *   - Media mode: Content-adaptive width (no arbitrary 560px cap), content-adaptive height (no 74px cap),
 *     responsive album artwork sizing (H - 2 * 6px), proportional rounded-rectangle radius (20px-26px).
 *   - Symmetrical around anchorX when sufficient room exists on both sides.
 *   - Near left corner: pins to left margin and expands rightward, strictly avoiding clipping.
 *   - Near right corner: pins to right margin and expands leftward, strictly avoiding clipping.
 *   - If corner constraints squeeze available width below unconstrained single-line width,
 *     intelligently wraps title and dynamically increases height.
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
      artworkSize: 22,
      artworkRadius: 11,
    };
  }

  // Expanded state
  let targetWidth: number;
  let targetHeight: number;
  let radius: number;
  let titleLines = 1;
  let artworkSize: number;
  let artworkRadius: number;

  if (expansionMode === "media") {
    const mediaDims = computeMediaDimensions(mediaInput, safeMonWidth);
    targetWidth = mediaDims.width;
    targetHeight = mediaDims.height;
    radius = mediaDims.radius;
    titleLines = mediaDims.titleLines;
    artworkSize = mediaDims.artworkSize;
    artworkRadius = mediaDims.artworkRadius;
  } else {
    targetWidth = Math.min(
      Math.round(collapsedWidth * EXPANSION_FACTOR),
      safeMonWidth - 2 * SCREEN_MARGIN
    );
    targetHeight = COLLAPSED_HEIGHT;
    radius = COLLAPSED_RADIUS;
    artworkSize = 22;
    artworkRadius = 11;
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

  // If corner clamping constrained the width more than the ideal width, re-evaluate wrapping & height
  if (expansionMode === "media" && !mediaInput?.isPlayerPanelOpen && actualWidth < targetWidth) {
    const measuredRight = mediaInput?.measured?.measuredRightWidth;
    const rightSectionWidth = typeof measuredRight === "number" && measuredRight > 0
      ? measuredRight
      : 46 + (mediaInput?.rightTasksCount ?? 0) * 22;
    const structuralWidth = MEDIA_VERTICAL_INSET + artworkSize + 10 + 12 + 10 + 5 + 10 + rightSectionWidth + 10;
    const availableTextWidth = actualWidth - structuralWidth - 12;

    const titleWidth = typeof mediaInput?.measured?.naturalTitleWidth === "number" && mediaInput.measured.naturalTitleWidth > 0
      ? mediaInput.measured.naturalTitleWidth
      : measureTextWidth(
          mediaInput?.title || "",
          "600 11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          6.8
        );

    if (titleWidth > availableTextWidth) {
      titleLines = titleWidth > availableTextWidth * 1.85 ? 3 : 2;
      if (!mediaInput?.measured?.measuredControlsHeight) {
        targetHeight = titleLines === 3 ? 88 : 74;
        artworkSize = getArtworkSize(targetHeight);
        artworkRadius = getArtworkRadius(artworkSize);
        radius = Math.round(Math.min(26, Math.max(20, targetHeight * 0.28)));
      }
    }
  }

  return {
    width: actualWidth,
    height: targetHeight,
    radius,
    titleLines,
    centerX,
    left,
    right,
    artworkSize,
    artworkRadius,
  };
}
