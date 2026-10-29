import type { BezierSegment, Point, Track } from 'animal-racer-shared';
import { LANE_WIDTH, MIN_CURVE_RADIUS } from 'animal-racer-shared';

const MAX_TURN_DEG = 120;
const MAX_TURN_RAD = MAX_TURN_DEG * Math.PI / 180;

// Single shared lane regardless of player count. Margin keeps the track
// (plus start/finish line and direction arrows, which extend ~LANE_WIDTH
// beyond the centerline) safely inside the generation bounds.
const LANE_COUNT = 1;
const TRACK_MARGIN = 30 + LANE_WIDTH;

export class TrackGenerator {
	private margin = 0;
	private worldWidth = 0;
	private worldHeight = 0;

	/**
	 * Generates a closed-loop track inside [0, 0, worldWidth, worldHeight].
	 *
	 * The bounds must describe a region fully covered by the paired devices
	 * (see PairingManager.safeWidth / safeHeight); the loop only ever bends
	 * inward from this rectangle, so it can never land off-screen.
	 */
	generate(worldWidth: number, worldHeight: number, wiggliness: number = 50): Track {
		this.worldWidth = worldWidth;
		this.worldHeight = worldHeight;
		this.margin = TRACK_MARGIN;

		const segments = this.generateClosedLoop(wiggliness);
		const arcLengthLUT = this.buildArcLengthLUT(segments);
		const totalArcLength = arcLengthLUT[arcLengthLUT.length - 1]?.length ?? 0;

		return {
			segments,
			totalArcLength,
			laneCount: LANE_COUNT,
			laneWidth: LANE_WIDTH,
			worldBounds: { width: worldWidth, height: worldHeight },
			arcLengthLUT,
		};
	}

	private generateClosedLoop(wiggliness: number): Array<BezierSegment> {
		const w = Math.max(0, Math.min(100, wiggliness)) / 100;
		const { margin, worldWidth, worldHeight } = this;

		const left = margin;
		const right = worldWidth - margin;
		const top = margin;
		const bottom = worldHeight - margin;
		const halfW = (right - left) / 2;
		const halfH = (bottom - top) / 2;

		// Points per side: 3 (w=0) to 7 (w=1)
		const perSide = Math.round(3 + w * 4) + Math.floor(Math.random() * 2);

		const waypoints: Array<Point> = [];

		// Max inward offset: 10% (smooth) to 80% (wiggly) of half-dimension
		const maxInwardFrac = 0.1 + w * 0.7;

		// Top edge (left → right)
		for (let i = 0; i < perSide; i++) {
			const frac = (i + 0.5) / perSide;
			const inward = Math.random() * maxInwardFrac * halfH;
			waypoints.push({ x: left + (right - left) * frac, y: top + inward });
		}
		// Right edge (top → bottom)
		for (let i = 0; i < perSide; i++) {
			const frac = (i + 0.5) / perSide;
			const inward = Math.random() * maxInwardFrac * halfW;
			waypoints.push({ x: right - inward, y: top + (bottom - top) * frac });
		}
		// Bottom edge (right → left)
		for (let i = 0; i < perSide; i++) {
			const frac = 1 - (i + 0.5) / perSide;
			const inward = Math.random() * maxInwardFrac * halfH;
			waypoints.push({ x: left + (right - left) * frac, y: bottom - inward });
		}
		// Left edge (bottom → top)
		for (let i = 0; i < perSide; i++) {
			const frac = 1 - (i + 0.5) / perSide;
			const inward = Math.random() * maxInwardFrac * halfW;
			waypoints.push({ x: left + inward, y: top + (bottom - top) * frac });
		}

		this.clampPoints(waypoints);

		// Smooth sharp turns (clamped within bounds)
		const smoothed = this.smoothSharpTurns(waypoints);

		// Insert equalizer loop at the longest gap
		let bestIdx = 0;
		let bestDist = 0;
		for (let i = 0; i < smoothed.length; i++) {
			const a = smoothed[i];
			const b = smoothed[(i + 1) % smoothed.length];
			const dist = Math.hypot(b.x - a.x, b.y - a.y);
			if (dist > bestDist) {
				bestDist = dist;
				bestIdx = i;
			}
		}

		const eqStart = smoothed[bestIdx];
		const eqEnd = smoothed[(bestIdx + 1) % smoothed.length];
		const eqWaypoints = this.generateEqualizerLoop(eqStart, eqEnd);

		const before = smoothed.slice(0, bestIdx + 1);
		const after = smoothed.slice(bestIdx + 1);
		const allWaypoints = [...before, ...eqWaypoints, ...after];

		// Round off any waypoint whose turn radius is below MIN_CURVE_RADIUS before
		// fitting the Bézier, so the final track has no corner sharper than the
		// design minimum. Densifying first gives the relaxation evenly spaced points
		// to work with (the raw waypoints vary wildly in spacing); it is a one-way
		// resample — the smooth Bézier is rebuilt from the rounded result.
		const dense = this.resampleClosed(allWaypoints, MIN_CURVE_RADIUS * 0.5);
		const rounded = this.enforceMinRadius(dense);

		return this.waypointsToClosedBezier(rounded);
	}

	// Resamples a closed polyline into roughly equidistant points so the follow-up
	// smoothing and Bézier handles behave uniformly around the loop.
	private resampleClosed(points: Array<Point>, spacing: number): Array<Point> {
		const n = points.length;
		if (n < 3) return points.map((p) => ({ ...p }));

		const segLen: Array<number> = [];
		let total = 0;
		for (let i = 0; i < n; i++) {
			const a = points[i];
			const b = points[(i + 1) % n];
			const d = Math.hypot(b.x - a.x, b.y - a.y);
			segLen.push(d);
			total += d;
		}
		if (total < 1e-6) return points.map((p) => ({ ...p }));

		const count = Math.max(16, Math.round(total / spacing));
		const step = total / count;
		const out: Array<Point> = [];
		let segIdx = 0;
		let segStart = 0;

		for (let i = 0; i < count; i++) {
			const target = i * step;
			while (segIdx < n - 1 && segStart + segLen[segIdx] < target) {
				segStart += segLen[segIdx];
				segIdx++;
			}
			const a = points[segIdx];
			const b = points[(segIdx + 1) % n];
			const frac = segLen[segIdx] > 1e-9 ? (target - segStart) / segLen[segIdx] : 0;
			out.push({ x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac });
		}

		return out;
	}

	// Constrained smoothing: each iteration nudges only the vertices whose turn radius
	// is below MIN_CURVE_RADIUS toward the midpoint of their neighbours (flattening the
	// bend raises its radius), leaving already-gentle sections untouched. Laplacian
	// smoothing of a closed loop shrinks it (curve-shortening flow), so after each pass
	// the loop is re-inflated about its centroid back to its original bounding box —
	// this rounds off sharp corners without collapsing the track.
	private enforceMinRadius(points: Array<Point>): Array<Point> {
		const pts = points.map((p) => ({ ...p }));
		const n = pts.length;
		if (n < 5) return pts;

		const minR = MIN_CURVE_RADIUS;
		const relax = 0.3;
		const maxIterations = 160;
		const target = this.bbox(pts);

		for (let iter = 0; iter < maxIterations; iter++) {
			const dx = new Array<number>(n).fill(0);
			const dy = new Array<number>(n).fill(0);
			let worst = 0;

			for (let i = 0; i < n; i++) {
				const prev = pts[(i - 1 + n) % n];
				const curr = pts[i];
				const next = pts[(i + 1) % n];
				const r = this.circumRadius(prev, curr, next);
				if (r < minR) {
					const w = relax * Math.min(1, (minR - r) / minR);
					dx[i] = ((prev.x + next.x) / 2 - curr.x) * w;
					dy[i] = ((prev.y + next.y) / 2 - curr.y) * w;
					if (minR - r > worst) worst = minR - r;
				}
			}

			for (let i = 0; i < n; i++) {
				pts[i].x += dx[i];
				pts[i].y += dy[i];
			}

			this.reinflate(pts, target);
			this.clampPoints(pts);

			if (worst < 0.5) break;
		}

		return pts;
	}

	private bbox(pts: Array<Point>): { cx: number; cy: number; w: number; h: number } {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const p of pts) {
			if (p.x < minX) minX = p.x;
			if (p.x > maxX) maxX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.y > maxY) maxY = p.y;
		}
		return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
	}

	// Scales the loop about its centroid so its bounding box matches `target` again,
	// undoing the shrinkage of the smoothing pass. Only ever grows (never shrinks),
	// so a rounded corner stays rounded.
	private reinflate(pts: Array<Point>, target: { cx: number; cy: number; w: number; h: number }): void {
		const now = this.bbox(pts);
		const sx = now.w > 1e-6 ? Math.max(1, target.w / now.w) : 1;
		const sy = now.h > 1e-6 ? Math.max(1, target.h / now.h) : 1;
		for (const p of pts) {
			p.x = now.cx + (p.x - now.cx) * sx;
			p.y = now.cy + (p.y - now.cy) * sy;
		}
	}

	// Radius of the circle through three points (Infinity if they are collinear).
	private circumRadius(a: Point, b: Point, c: Point): number {
		const ab = Math.hypot(b.x - a.x, b.y - a.y);
		const bc = Math.hypot(c.x - b.x, c.y - b.y);
		const ca = Math.hypot(a.x - c.x, a.y - c.y);
		const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
		if (area2 < 1e-9) return Infinity;
		return (ab * bc * ca) / (2 * area2);
	}

	private clampPoints(pts: Array<Point>): void {
		const { margin, worldWidth, worldHeight } = this;
		for (const p of pts) {
			p.x = Math.max(margin, Math.min(worldWidth - margin, p.x));
			p.y = Math.max(margin, Math.min(worldHeight - margin, p.y));
		}
	}

	private smoothSharpTurns(waypoints: Array<Point>): Array<Point> {
		const pts = [...waypoints];

		// Push sharp vertices toward the midpoint of their neighbours
		// (softens the angle without moving points out of bounds)
		for (let iter = 0; iter < 30; iter++) {
			let anySharp = false;

			for (let i = 0; i < pts.length; i++) {
				const prev = pts[(i - 1 + pts.length) % pts.length];
				const curr = pts[i];
				const nxt = pts[(i + 1) % pts.length];
				const angle = this.turnAngle(prev, curr, nxt);

				if (angle > MAX_TURN_RAD) {
					anySharp = true;
					// Move curr toward the midpoint of prev-nxt (softens the bend)
					const midX = (prev.x + nxt.x) / 2;
					const midY = (prev.y + nxt.y) / 2;
					pts[i] = {
						x: curr.x * 0.5 + midX * 0.5,
						y: curr.y * 0.5 + midY * 0.5,
					};
				}
			}

			if (!anySharp) break;
		}

		return pts;
	}

	private turnAngle(a: Point, b: Point, c: Point): number {
		const inX = b.x - a.x;
		const inY = b.y - a.y;
		const outX = c.x - b.x;
		const outY = c.y - b.y;
		const inLen = Math.hypot(inX, inY);
		const outLen = Math.hypot(outX, outY);
		if (inLen < 1e-6 || outLen < 1e-6) return 0;

		const dot = (inX * outX + inY * outY) / (inLen * outLen);
		return Math.acos(Math.max(-1, Math.min(1, dot)));
	}

	private generateEqualizerLoop(start: Point, end: Point): Array<Point> {
		const { margin, worldWidth, worldHeight } = this;

		const midX = (start.x + end.x) / 2;
		const midY = (start.y + end.y) / 2;

		const dx = end.x - start.x;
		const dy = end.y - start.y;
		const segLen = Math.hypot(dx, dy);
		if (segLen < 1e-6) return [];

		const perpX = -dy / segLen;
		const perpY = dx / segLen;

		const toCenterX = worldWidth / 2 - midX;
		const toCenterY = worldHeight / 2 - midY;
		const dot = perpX * toCenterX + perpY * toCenterY;
		const inwardSign = dot > 0 ? 1 : -1;

		const minDim = Math.min(worldWidth, worldHeight);
		const loopRadius = Math.max(minDim * 0.12, MIN_CURVE_RADIUS * 1.1);

		const loopCX = Math.max(margin + loopRadius, Math.min(worldWidth - margin - loopRadius,
			midX + perpX * inwardSign * loopRadius * 1.8));
		const loopCY = Math.max(margin + loopRadius, Math.min(worldHeight - margin - loopRadius,
			midY + perpY * inwardSign * loopRadius * 1.8));

		const entryAngle = Math.atan2(midY - loopCY, midX - loopCX);

		const loopPoints: Array<Point> = [];
		for (let i = 0; i < 8; i++) {
			const angle = entryAngle - (i / 8) * Math.PI * 2;
			loopPoints.push({
				x: Math.max(margin, Math.min(worldWidth - margin, loopCX + Math.cos(angle) * loopRadius)),
				y: Math.max(margin, Math.min(worldHeight - margin, loopCY + Math.sin(angle) * loopRadius)),
			});
		}

		return loopPoints;
	}

	private waypointsToClosedBezier(waypoints: Array<Point>): Array<BezierSegment> {
		const n = waypoints.length;

		// Uniform Catmull-Rom tangents. Both Bézier segments meeting at a waypoint
		// share this one tangent vector, giving C1 continuity (matching derivatives,
		// not just directions) — so curvature is continuous across junctions and no
		// spurious curvature spikes appear where segments meet.
		const tangents: Array<Point> = [];
		for (let i = 0; i < n; i++) {
			const prev = waypoints[(i - 1 + n) % n];
			const next = waypoints[(i + 1) % n];
			tangents.push({ x: (next.x - prev.x) / 2, y: (next.y - prev.y) / 2 });
		}

		const segments: Array<BezierSegment> = [];

		for (let i = 0; i < n; i++) {
			const p0 = waypoints[i];
			const p3 = waypoints[(i + 1) % n];
			const m0 = tangents[i];
			const m1 = tangents[(i + 1) % n];

			const p1: Point = {
				x: p0.x + m0.x / 3,
				y: p0.y + m0.y / 3,
			};
			const p2: Point = {
				x: p3.x - m1.x / 3,
				y: p3.y - m1.y / 3,
			};

			const arcLength = this.computeArcLength(p0, p1, p2, p3);
			segments.push({ p0, p1, p2, p3, arcLength });
		}

		return segments;
	}

	private computeArcLength(p0: Point, p1: Point, p2: Point, p3: Point): number {
		const steps = 64;
		let length = 0;
		let prev = p0;

		for (let i = 1; i <= steps; i++) {
			const t = i / steps;
			const pt = this.evalBezier(p0, p1, p2, p3, t);
			const dx = pt.x - prev.x;
			const dy = pt.y - prev.y;
			length += Math.sqrt(dx * dx + dy * dy);
			prev = pt;
		}

		return length;
	}

	private evalBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
		const mt = 1 - t;
		const mt2 = mt * mt;
		const mt3 = mt2 * mt;
		const t2 = t * t;
		const t3 = t2 * t;

		return {
			x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
			y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
		};
	}

	buildArcLengthLUT(segments: Array<BezierSegment>): Array<{ t: number; length: number }> {
		const samplesPerSeg = 100;
		const lut: Array<{ t: number; length: number }> = [{ t: 0, length: 0 }];
		let cumLength = 0;
		const totalSegments = segments.length;

		for (let segIdx = 0; segIdx < totalSegments; segIdx++) {
			const seg = segments[segIdx];
			let prev = seg.p0;

			for (let i = 1; i <= samplesPerSeg; i++) {
				const localT = i / samplesPerSeg;
				const pt = this.evalBezier(seg.p0, seg.p1, seg.p2, seg.p3, localT);
				const dx = pt.x - prev.x;
				const dy = pt.y - prev.y;
				cumLength += Math.sqrt(dx * dx + dy * dy);

				const globalT = (segIdx + localT) / totalSegments;
				lut.push({ t: globalT, length: cumLength });
				prev = pt;
			}
		}

		return lut;
	}
}
