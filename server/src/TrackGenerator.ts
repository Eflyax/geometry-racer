import type { BezierSegment, Point, Track } from 'animal-racer-shared';
import { LANE_WIDTH, MIN_CURVE_RADIUS } from 'animal-racer-shared';

export class TrackGenerator {
	generate(worldWidth: number, worldHeight: number, laneCount: number): Track {
		const margin = 80;
		const segments = this.generateCenterline(worldWidth, worldHeight, margin);
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

	private generateCenterline(worldWidth: number, worldHeight: number, margin: number): Array<BezierSegment> {
		const segCount = 6 + Math.floor(Math.random() * 3);
		const startX = margin;
		const endX = worldWidth - margin;
		const centerY = worldHeight / 2;
		const amplitude = (worldHeight / 2) - margin - LANE_WIDTH * 2;

		const waypoints: Array<Point> = [];
		waypoints.push({ x: startX, y: centerY });

		for (let i = 1; i < segCount; i++) {
			const frac = i / segCount;
			const x = startX + (endX - startX) * frac;
			const yOffset = (Math.random() - 0.5) * 2 * amplitude;
			const y = Math.max(margin + LANE_WIDTH * 2, Math.min(worldHeight - margin - LANE_WIDTH * 2, centerY + yOffset));
			waypoints.push({ x, y });
		}

		waypoints.push({ x: endX, y: centerY });

		const segments: Array<BezierSegment> = [];

		for (let i = 0; i < waypoints.length - 1; i++) {
			const p0 = waypoints[i];
			const p3 = waypoints[i + 1];
			const dx = p3.x - p0.x;

			const p1: Point = {
				x: p0.x + dx * 0.33,
				y: p0.y + (Math.random() - 0.5) * amplitude * 0.6,
			};
			const p2: Point = {
				x: p0.x + dx * 0.66,
				y: p3.y + (Math.random() - 0.5) * amplitude * 0.6,
			};

			p1.y = Math.max(margin, Math.min(worldHeight - margin, p1.y));
			p2.y = Math.max(margin, Math.min(worldHeight - margin, p2.y));

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
