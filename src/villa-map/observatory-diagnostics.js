import { MUSHROOM_INTERIOR } from "./world.js";
import { OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR } from "./observatory-black-hole.js";

// Stable camera bookmarks used by the browser visual-regression workflow.
// They deliberately live outside React so Node tests can guard accidental
// drift in the screenshots that anchor every observatory implementation phase.
const { center, eyeY, floorY } = MUSHROOM_INTERIOR;
const domeTargetY = floorY[2] + 8.7;

export const OBSERVATORY_DIAGNOSTIC_VIEWS = Object.freeze({
  "l2-stair": Object.freeze({
    position: Object.freeze([center.x - 4, eyeY[1], center.z - 2.8]),
    target: Object.freeze([center.x, domeTargetY, center.z + 0.2])
  }),
  "loft-center": Object.freeze({
    position: Object.freeze([center.x, eyeY[2], center.z]),
    target: Object.freeze([center.x, domeTargetY, center.z + 0.2])
  }),
  "loft-edge": Object.freeze({
    position: Object.freeze([center.x + 7.4, eyeY[2], center.z + 0.4]),
    target: Object.freeze([center.x, domeTargetY - 0.6, center.z])
  }),
  "black-hole-edge": Object.freeze({
    // Offset enough to expose finite-distance parallax while staying clear of
    // the dome aperture rim, so this remains a useful visual QA bookmark.
    position: Object.freeze([center.x + 4.4, eyeY[2], center.z + 1.2]),
    target: Object.freeze([
      OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR.x,
      OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR.y,
      OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR.z
    ])
  }),
  "loft-room": Object.freeze({
    position: Object.freeze([center.x, eyeY[2], center.z + 5.8]),
    target: Object.freeze([center.x, floorY[2] + 2.1, center.z - 1.8])
  })
});

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * fraction) - 1)
  );
  return sortedValues[index];
}

export function summarizeObservatoryFrameTimes(samples) {
  const sorted = (samples ?? [])
    .filter((value) => Number.isFinite(value) && value >= 0)
    .slice()
    .sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const p99 = percentile(sorted, 0.99);
  return Object.freeze({
    count: sorted.length,
    p50Ms: p50,
    p95Ms: p95,
    p99Ms: p99,
    onePercentLowFps: p99 > 0 ? 1000 / p99 : 0
  });
}

export function estimateObservatoryRenderTargetBytes(
  width,
  height,
  { bytesPerPixel = 8, buffers = 1 } = {}
) {
  const safeWidth = Math.max(0, Math.floor(Number.isFinite(width) ? width : 0));
  const safeHeight = Math.max(0, Math.floor(Number.isFinite(height) ? height : 0));
  const safeBytes = Math.max(
    0,
    Number.isFinite(bytesPerPixel) ? bytesPerPixel : 0
  );
  const safeBuffers = Math.max(0, Math.floor(Number.isFinite(buffers) ? buffers : 0));
  return safeWidth * safeHeight * safeBytes * safeBuffers;
}
