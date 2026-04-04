import type { BezierSegment, Point, Track } from 'animal-racer-shared';
import { LANE_WIDTH } from 'animal-racer-shared';

const MAX_TURN_DEG = 120;
const MAX_TURN_RAD = MAX_TURN_DEG * Math.PI / 180;

export class TrackGenerator {
	private margin = 0;
	private worldWidth = 0;
	private worldHeight = 0;

	generate(worldWidth: number, worldHeight: number, laneCount: number, wiggliness: number = 50): Track {
		this.worldWidth = worldWidth;
		this.worldHeight = worldHeight;
		this.margin = 30 + LANE_WIDTH * laneCount;

		const segments = this.generateClosedLoop(wiggliness);
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

		return this.waypointsToClosedBezier(allWaypoints);
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
		const loopRadius = Math.max(minDim * 0.12, 80);

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

		const tangentDirs: Array<Point> = [];
		for (let i = 0; i < n; i++) {
			const prev = waypoints[(i - 1 + n) % n];
			const curr = waypoints[i];
			const next = waypoints[(i + 1) % n];

			const inDist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
			const outDist = Math.hypot(next.x - curr.x, next.y - curr.y);

			const inDir = inDist > 0
				? { x: (curr.x - prev.x) / inDist, y: (curr.y - prev.y) / inDist }
				: { x: 0, y: 0 };
			const outDir = outDist > 0
				? { x: (next.x - curr.x) / outDist, y: (next.y - curr.y) / outDist }
				: { x: 0, y: 0 };

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
