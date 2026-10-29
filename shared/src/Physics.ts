import type { BezierSegment, CarState, Point, RoomConfig, Track } from './types.js';
import {
	DERAIL_GRACE_MS,
	DERAIL_GRIP,
	DERAIL_MIN_SPEED_FRAC,
	DERAIL_SAMPLES,
	DERAIL_WINDOW_PX,
} from './constants.js';

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
				car.overload = 0;
			}
			return;
		}

		if (touching) {
			car.speed = Math.min(car.speed + config.accel * dt, config.maxSpeed);
		} else {
			car.speed = Math.max(car.speed - config.decel * dt, 0);
		}

		if (car.speed > 0) {
			const deltaT = (car.speed * dt) / track.totalArcLength;
			car.t += deltaT;

			// Robust curvature: median |κ| over an arc-length window around the car.
			// A cubic Bézier can spike to a near-cusp at a single point (segment
			// junctions, tight control points); the median rejects those outliers so
			// derailment tracks the genuine sustained bend, not sampling artifacts.
			const curvature = this.sampledCurvature(car.t, track);

			// Grip gives out when cornering load v²·κ exceeds the budget, i.e. when
			// speed > coeff·sqrt(GRIP/κ). Below a crawl there is no meaningful load,
			// so the car can always be nursed through any corner slowly.
			const minDerailSpeed = config.maxSpeed * DERAIL_MIN_SPEED_FRAC;
			let overloaded = false;
			if (car.speed > minDerailSpeed && curvature > 1e-4) {
				const maxSafeSpeed = config.derailmentCoefficient * Math.sqrt(DERAIL_GRIP / curvature);
				overloaded = car.speed > maxSafeSpeed;
			}

			// Only a sustained overload derails; a single-frame spike is forgiven and
			// the overload decays faster than it builds once the car is back in limit.
			if (overloaded) {
				car.overload += dt;
				if (car.overload >= DERAIL_GRACE_MS / 1000) {
					car.derailed = true;
					car.derailT = car.t;
					car.penaltyRemaining = config.penaltyDuration;
					car.overload = 0;
					return;
				}
			} else {
				car.overload = Math.max(0, car.overload - dt * 2);
			}
		}

		const targetLaps = config.laps;
		if (car.t >= targetLaps) {
			car.t = targetLaps;
			car.finished = true;
			car.finishTime = Date.now();
			car.speed = 0;
		}
	}

	// Median |curvature| sampled over an arc-length window centered on globalT.
	// Using the median (an odd sample count) discards the isolated near-cusp
	// spikes a cubic Bézier produces at segment junctions, so the value reflects
	// the sustained bend the car actually experiences.
	static sampledCurvature(globalT: number, track: Track): number {
		const total = track.totalArcLength;
		if (total <= 0) return 0;

		const half = DERAIL_WINDOW_PX / 2;
		const values: Array<number> = [];
		for (let i = 0; i < DERAIL_SAMPLES; i++) {
			const offset = -half + (DERAIL_WINDOW_PX * i) / (DERAIL_SAMPLES - 1);
			const t = (((globalT + offset / total) % 1) + 1) % 1;
			values.push(this.getCurvature(t, track));
		}

		values.sort((a, b) => a - b);
		return values[values.length >> 1];
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
