export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
export const MAX_SPEED = 900;
export const ACCEL = 300;
export const DECEL = 300;
export const LANE_WIDTH = 30;
export const LANE_MARGIN = 10;
export const MIN_CURVE_RADIUS = 120;

// ─── Derailment / grip model ────────────────────────────────────────────────
// Cornering needs centripetal acceleration a = v²·κ; grip gives out once a
// exceeds this budget, i.e. maxSafeSpeed = derailmentCoefficient·sqrt(GRIP/κ).
// 3600 ⇒ a 100px-radius corner is the fastest safe corner at v=600 (maxSpeed).
export const DERAIL_GRIP = 3600;
// Robust curvature is the median |κ| sampled over this arc-length window, which
// rejects the near-cusp spikes a cubic Bézier produces at segment junctions.
export const DERAIL_WINDOW_PX = 70;
export const DERAIL_SAMPLES = 11;
// A sustained overload (not a single frame) is required before derailing, so a
// player can clip an apex and recover by easing off the throttle.
export const DERAIL_GRACE_MS = 100;
// Below this fraction of maxSpeed the car never derails — there is no meaningful
// lateral load at a crawl, so any corner can be nursed through slowly.
export const DERAIL_MIN_SPEED_FRAC = 0.3;
export const ROOM_CODE_LENGTH = 4;
export const ROOM_EXPIRY_MS = 30 * 60 * 1000;
export const CAR_WIDTH = 40;
export const CAR_HEIGHT = 20;
