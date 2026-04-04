import type { BezierSegment, Point, Track } from 'animal-racer-shared';
import { LANE_WIDTH } from 'animal-racer-shared';

export class TrackGenerator {
	generate(worldWidth: number, worldHeight: number, laneCount: number): Track {
		const margin = 30 + LANE_WIDTH * laneCount;
		const segments = this.generateClosedLoop(worldWidth, worldHeight, margin);
		const arcLengthLUT = this.buildArcLengthLUT(segments);
		const totalArcLength = arcLengthLUT[arcLengthLUT.length - 1]?.length ?? 0;

		return {
			segments,
			totalArcLength,
			laneCount,
			laneWidth: LANE_WIDTH,
			worldBounds: { width: worldWidth, height: worldHeight },
			arcLengthLUT,
		};
	}

	private generateClosedLoop(worldWidth: number, worldHeight: number, margin: number): Array<BezierSegment> {
		const cx = worldWidth / 2;
		const cy = worldHeight / 2;
		const rx = (worldWidth - margin * 2) / 2;
		const ry = (worldHeight - margin * 2) / 2;

		// Main loop: 10-12 waypoints spread around the oval
		// High rVariation range (0.85-1.0) keeps the track pushed out toward edges
		const mainPointCount = 10 + Math.floor(Math.random() * 3);
		const waypoints: Array<Point> = [];

		for (let i = 0; i < mainPointCount; i++) {
			const angle = (i / mainPointCount) * Math.PI * 2;
			const rVariation = 0.85 + Math.random() * 0.15;
			waypoints.push({
				x: cx + Math.cos(angle) * rx * rVariation,
				y: cy + Math.sin(angle) * ry * rVariation,
			});
		}

		// Clamp inside world
		for (const wp of waypoints) {
			wp.x = Math.max(margin, Math.min(worldWidth - margin, wp.x));
			wp.y = Math.max(margin, Math.min(worldHeight - margin, wp.y));
		}

		// Insert equalizer loop between two waypoints on the side with most space
		// Pick the pair with longest distance for a spacious equalizer
		let bestIdx = 0;
		let bestDist = 0;
		for (let i = 0; i < waypoints.length; i++) {
			const a = waypoints[i];
			const b = waypoints[(i + 1) % waypoints.length];
			const dist = Math.hypot(b.x - a.x, b.y - a.y);
			if (dist > bestDist) {
				bestDist = dist;
				bestIdx = i;
			}
		}

		const eqStart = waypoints[bestIdx];
		const eqEnd = waypoints[(bestIdx + 1) % waypoints.length];
		const eqWaypoints = this.generateEqualizerLoop(eqStart, eqEnd, margin, worldWidth, worldHeight);

		// Splice equalizer into the waypoint ring
		const before = waypoints.slice(0, bestIdx + 1);
		const after = waypoints.slice(bestIdx + 1);
		const allWaypoints = [...before, ...eqWaypoints, ...after];

		return this.waypointsToClosedBezier(allWaypoints);
	}

	private generateEqualizerLoop(start: Point, end: Point, margin: number, worldWidth: number, worldHeight: number): Array<Point> {
		// Equalizer loop: a visible clockwise circle inserted between start and end.
		// Sized proportionally to the world for clear visibility.

		const midX = (start.x + end.x) / 2;
		const midY = (start.y + end.y) / 2;

		const dx = end.x - start.x;
		const dy = end.y - start.y;
		const segLen = Math.hypot(dx, dy);
		const perpX = -dy / segLen;
		const perpY = dx / segLen;

		// Point the loop inward (toward world center)
		const toCenterX = worldWidth / 2 - midX;
		const toCenterY = worldHeight / 2 - midY;
		const dot = perpX * toCenterX + perpY * toCenterY;
		const inwardSign = dot > 0 ? 1 : -1;

		// Equalizer radius: large enough to be clearly visible
		// Scales with world size, at least 15% of the shorter dimension
		const minDim = Math.min(worldWidth, worldHeight);
		const loopRadius = Math.max(minDim * 0.12, 80);

		// Center the loop inward from the midpoint
		const loopCX = Math.max(margin + loopRadius, Math.min(worldWidth - margin - loopRadius,
			midX + perpX * inwardSign * loopRadius * 1.8));
		const loopCY = Math.max(margin + loopRadius, Math.min(worldHeight - margin - loopRadius,
			midY + perpY * inwardSign * loopRadius * 1.8));

		// Entry: point on the loop circle closest to midpoint
		const entryAngle = Math.atan2(midY - loopCY, midX - loopCX);

		// 8 waypoints clockwise around the loop for a smooth circle
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

		// Pre-compute tangent direction at each waypoint as the bisector
		// of incoming and outgoing edge directions. This is robust even when
		// adjacent segments have very different lengths (e.g. main loop → equalizer).
		const tangentDirs: Array<Point> = [];
		for (let i = 0; i < n; i++) {
			const prev = waypoints[(i - 1 + n) % n];
			const curr = waypoints[i];
			const next = waypoints[(i + 1) % n];

			const inDist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
			const outDist = Math.hypot(next.x - curr.x, next.y - curr.y);

			// Normalized incoming and outgoing directions
			const inDir = inDist > 0
				? { x: (curr.x - prev.x) / inDist, y: (curr.y - prev.y) / inDist }
				: { x: 0, y: 0 };
			const outDir = outDist > 0
				? { x: (next.x - curr.x) / outDist, y: (next.y - curr.y) / outDist }
				: { x: 0, y: 0 };

			// Average direction (bisector) gives a smooth tangent.
			// When the angle is very sharp (bisector near zero), fall back
			// to the outgoing direction to avoid instability.
			let tx = inDir.x + outDir.x;
			let ty = inDir.y + outDir.y;
			const tLen = Math.hypot(tx, ty);
			if (tLen > 0.1) {
				tx /= tLen;
				ty /= tLen;
			} else {
				tx = outDir.x;
				ty = outDir.y;
			}

			tangentDirs.push({ x: tx, y: ty });
		}

		// Pre-compute edge lengths for clamping
		const edgeLens: Array<number> = [];
		for (let i = 0; i < n; i++) {
			const a = waypoints[i];
			const b = waypoints[(i + 1) % n];
			edgeLens.push(Math.hypot(b.x - a.x, b.y - a.y));
		}

		const segments: Array<BezierSegment> = [];

		for (let i = 0; i < n; i++) {
			const p0 = waypoints[i];
			const p3 = waypoints[(i + 1) % n];
			const segDist = edgeLens[i];

			// Control point distance: clamped to the shorter of this segment
			// and its neighbours, so transitions between long and short segments
			// (main loop → equalizer) never overshoot.
			const prevLen = edgeLens[(i - 1 + n) % n];
			const nextLen = edgeLens[(i + 1) % n];
			const cpDist = Math.min(segDist, prevLen, nextLen) / 3;

			const dir0 = tangentDirs[i];
			const dir3 = tangentDirs[(i + 1) % n];

			const p1: Point = {
				x: p0.x + dir0.x * cpDist,
				y: p0.y + dir0.y * cpDist,
			};
			const p2: Point = {
				x: p3.x - dir3.x * cpDist,
				y: p3.y - dir3.y * cpDist,
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
