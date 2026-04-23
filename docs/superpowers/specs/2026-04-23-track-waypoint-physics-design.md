# Track Waypoint Physics — Design Spec

**Date:** 2026-04-23  
**Status:** Approved

## Problem

Two issues with the current Bézier-based physics:

**A — Visual slowdown artifact:** Cars appear to slow before corners even when the player holds the screen. Root cause: `deltaT = deltaArc / totalArcLength` assumes the global Bézier `t` parameter maps linearly to arc length, which is false. The `arcLengthLUT` exists but is never used for car advancement.

**B — Abrupt derailment:** When a car enters a curve too fast, the penalty triggers instantly (freeze + timer). There is no window for the player to react. The desired behaviour is: curves require the player to release before the corner, with a smooth forced-deceleration phase before the hard penalty.

## Approach

Replace the `BezierSegment[]` track representation with a dense `Waypoint[]` polyline sampled at generation time. Waypoints are evenly spaced by arc length (~5 px apart), so physics and rendering both become direct array lookups — no Bézier math required at runtime.

## Data Model

### New type: `Waypoint`

```ts
interface Waypoint {
    x: number;
    y: number;
    angle: number;            // direction of travel (atan2 of tangent vector)
    curvature: number;        // |κ| precomputed: turningAngle / segmentLength (discrete approximation)
    cumulativeLength: number; // arc length from track start to this point
}
```

Curvature at waypoint B (between A and B and C): `κ = angleBetween(A→B, B→C) / averageSegmentLength`. With ~5 px spacing this gives the same order of magnitude as the current Bézier formula and is compatible with the existing `derailmentCoefficient` calibration.

### Updated type: `Track`

```ts
interface Track {
    waypoints: Array<Waypoint>;
    totalArcLength: number;
    laneCount: number;
    laneWidth: number;
    worldBounds: { width: number; height: number };
}
```

**Removed from `Track`:** `segments`, `arcLengthLUT`.  
**Removed shared type:** `BezierSegment` (no longer needed outside the generator).

`TrackGenerator` continues to build Bézier curves internally, then samples them into waypoints before returning. The Bézier logic stays confined to the generator and is not part of the shared contract.

### Car position

`car.t` stays as 0–N (N = lap count), where 1.0 = one full lap.  
Waypoint lookup: `waypointIdx = Math.floor((car.t % 1) * waypoints.length)`.  
Advancement: `car.t += speed * dt / totalArcLength` — same formula as today, but now maps accurately to arc length.

## Physics

### Car advancement (fixes A)

Because waypoints are arc-length uniform, the lookup `waypoints[waypointIdx]` gives the correct position with no further correction. The visual slowdown disappears.

### Lookahead speed limiting (fixes B)

Before each tick, scan waypoints covering ~0.3 s of travel ahead of the car and find the maximum curvature in that window. Derive `maxSafeSpeed` from it using the existing formula:

```
maxSafeSpeed = derailmentCoefficient × √(3600 / peakCurvature)
```

If `car.speed > maxSafeSpeed`:
- Apply forced deceleration at ~3× normal `decel` rate ("car struggles in the curve").
- The player can avert this by releasing the screen early enough.
- If speed still exceeds `maxSafeSpeed` at the waypoint of peak curvature → derailment (unchanged penalty mechanic).

This gives the player a reaction window: the curve "pulls" the car toward its safe speed limit progressively rather than triggering an instant penalty.

### Removed from Physics.ts

- `bezierCurvature`
- `bezierDerivative1`
- `bezierDerivative2`
- `getCurvature` (replaced by `waypoints[idx].curvature` direct lookup)

## Rendering

### TrackSvg — buildLanePath

Iterates waypoints directly instead of sampling Bézier curves:

```ts
function buildLanePath(lane: number): string {
    const offset = (lane - (track.laneCount - 1) / 2) * track.laneWidth;
    const points = track.waypoints.map(wp => ({
        x: wp.x - Math.sin(wp.angle) * offset,
        y: wp.y + Math.cos(wp.angle) * offset,
    }));
    // build SVG path from points
}
```

Waypoint density (~5 px) produces visually smooth curves — equal or better quality than the current 50-steps-per-segment sampling.

### Other rendering

`directionArrows`, `startFinishLine`, `getPositionOnTrack` — all switch to direct `waypoints[]` index lookup. `arcLengthToT` (binary search in LUT) is removed; waypoint index is the lookup primitive.

### Renderer

SVG stays. The waypoint approach simplifies SVG rendering.

## Sampling Parameters

| Parameter | Value | Rationale |
|---|---|---|
| Waypoint spacing | ~5 px | Smooth curves; ~600 pts for a typical 3000 px track |
| Lookahead distance | `speed × 0.3 s` | ~0.3 s reaction window at max speed |
| Forced decel multiplier | 3× `config.decel` | Noticeable but not instant; player can still recover |

## Files Affected

| File | Change |
|---|---|
| `shared/src/types.ts` | Add `Waypoint`, update `Track`, remove `BezierSegment` |
| `shared/src/Physics.ts` | Rewrite car update and position lookup to use waypoints |
| `shared/src/index.ts` | Update exports |
| `server/src/TrackGenerator.ts` | Add waypoint sampling step at end of `generate()` |
| `client/src/components/TrackSvg.vue` | Update `buildLanePath` and all position helpers |
