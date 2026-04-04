import type { BezierSegment, CarState, Point, RoomConfig, Track } from 'animal-racer-shared';
import { ACCEL, DECEL, MAX_SPEED } from 'animal-racer-shared';

export class Physics {
	static updateCar(car: CarState, touching: boolean, dt: number, track: Track, config: RoomConfig): void {
		if (car.finished) return;

		if (car.derailed) {
			car.penaltyRemaining -= dt * 1000;
			if (car.penaltyRemaining <= 0) {
				car.derailed = false;
				car.penaltyRemaining = 0;
				car.t = car.derailT;
				car.speed = 0;
			}
			return;
		}

		if (touching) {
			car.speed = Math.min(car.speed + ACCEL * dt, MAX_SPEED);
		} else {
			car.speed = Math.max(car.speed - DECEL * dt, 0);
		}

		if (car.speed > 0) {
			const deltaArc = car.speed * dt;
			const deltaT = deltaArc / track.totalArcLength;
			car.t += deltaT;

			const curvature = this.getCurvature(car.t, track);
			if (curvature > 0) {
				const maxSafeSpeed = config.derailmentCoefficient * 150 / curvature;
				if (car.speed > maxSafeSpeed) {
					car.derailed = true;
					car.derailT = car.t;
					car.penaltyRemaining = config.penaltyDuration;
					return;
				}
			}
		}

		if (car.t >= 1.0) {
			car.t = 1.0;
			car.finished = true;
			car.finishTime = Date.now();
			car.speed = 0;
		}
	}

	static getCurvature(globalT: number, track: Track): number {
		const t = Math.max(0, Math.min(1, globalT));
		const segCount = track.segments.length;
		const segFloat = t * segCount;
		const segIdx = Math.min(Math.floor(segFloat), segCount - 1);
		const localT = segFloat - segIdx;

		const seg = track.segments[segIdx];
		return this.bezierCurvature(seg, localT);
	}

	static bezierCurvature(seg: BezierSegment, t: number): number {
		const d1 = this.bezierDerivative1(seg, t);
		const d2 = this.bezierDerivative2(seg, t);

		const cross = d1.x * d2.y - d1.y * d2.x;
		const dMag = Math.sqrt(d1.x * d1.x + d1.y * d1.y);

		if (dMag < 1e-6) return 0;

		return Math.abs(cross) / (dMag * dMag * dMag);
	}

	static bezierDerivative1(seg: BezierSegment, t: number): Point {
		const mt = 1 - t;
		return {
			x: 3 * mt * mt * (seg.p1.x - seg.p0.x) + 6 * mt * t * (seg.p2.x - seg.p1.x) + 3 * t * t * (seg.p3.x - seg.p2.x),
			y: 3 * mt * mt * (seg.p1.y - seg.p0.y) + 6 * mt * t * (seg.p2.y - seg.p1.y) + 3 * t * t * (seg.p3.y - seg.p2.y),
		};
	}

	static bezierDerivative2(seg: BezierSegment, t: number): Point {
		return {
			x: 6 * (1 - t) * (seg.p2.x - 2 * seg.p1.x + seg.p0.x) + 6 * t * (seg.p3.x - 2 * seg.p2.x + seg.p1.x),
			y: 6 * (1 - t) * (seg.p2.y - 2 * seg.p1.y + seg.p0.y) + 6 * t * (seg.p3.y - 2 * seg.p2.y + seg.p1.y),
		};
	}

	static getPositionOnTrack(globalT: number, lane: number, track: Track): { x: number; y: number; angle: number } {
		const t = Math.max(0, Math.min(1, globalT));
		const segCount = track.segments.length;
		const segFloat = t * segCount;
		const segIdx = Math.min(Math.floor(segFloat), segCount - 1);
		const localT = segFloat - segIdx;

		const seg = track.segments[segIdx];
		const pos = this.evalBezier(seg, localT);
		const d1 = this.bezierDerivative1(seg, localT);

		const angle = Math.atan2(d1.y, d1.x);
		const normal = { x: -Math.sin(angle), y: Math.cos(angle) };

		const laneOffset = (lane - (track.laneCount - 1) / 2) * track.laneWidth;

		return {
			x: pos.x + normal.x * laneOffset,
			y: pos.y + normal.y * laneOffset,
			angle,
		};
	}

	static evalBezier(seg: BezierSegment, t: number): Point {
		const mt = 1 - t;
		const mt2 = mt * mt;
		const mt3 = mt2 * mt;
		const t2 = t * t;
		const t3 = t2 * t;

		return {
			x: mt3 * seg.p0.x + 3 * mt2 * t * seg.p1.x + 3 * mt * t2 * seg.p2.x + t3 * seg.p3.x,
			y: mt3 * seg.p0.y + 3 * mt2 * t * seg.p1.y + 3 * mt * t2 * seg.p2.y + t3 * seg.p3.y,
		};
	}
}
