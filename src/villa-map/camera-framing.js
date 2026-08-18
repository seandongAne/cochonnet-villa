// Node-pure camera framing for ultra-wide displays.
//
// three.js treats `fov` as the VERTICAL field of view and derives the
// horizontal one from the aspect ratio ("Hor+"): a wider monitor shows more
// world to the sides, which is what an ultra-wide should do. Past roughly 21:9
// that stops being free — at 32:9 the stock 70° vertical FOV spreads into a
// ~136° horizontal view and the edges of the frame smear.
//
// So: keep the authored vertical FOV exactly as-is up to HOR_FOV_MAX (16:9,
// 16:10 and 21:9 are all below it, i.e. unchanged), and only past that hold
// the horizontal FOV steady by narrowing the vertical one.
//
// Note this is a GUARD, not a fix for a defect the current page has: the map
// mounts as a centred card whose height tracks the viewport, so even on a 32:9
// screen the canvas measures ~1.97 (2557x1295 at 5120x1440) and stays below
// the cap. It earns its place if the canvas ever goes full-bleed — which is
// exactly when an unbounded fov would smear the frame.

export const BASE_VERTICAL_FOV = 70;
export const HOR_FOV_MAX = 120;

const DEG = Math.PI / 180;

export function horizontalFov(verticalFov, aspect) {
  return (2 * Math.atan(Math.tan((verticalFov * DEG) / 2) * aspect)) / DEG;
}

export function verticalFovForAspect(
  aspect,
  baseFov = BASE_VERTICAL_FOV,
  maxHorizontalFov = HOR_FOV_MAX
) {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return baseFov;
  }

  if (horizontalFov(baseFov, aspect) <= maxHorizontalFov) {
    return baseFov;
  }

  return (2 * Math.atan(Math.tan((maxHorizontalFov * DEG) / 2) / aspect)) / DEG;
}
