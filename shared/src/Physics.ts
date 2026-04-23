import type { CarState, RoomConfig, Track } from './types.js';

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
			car.speed = Math.min(car.speed + config.accel * dt, config.maxSpeed);
		} else {
			car.speed = Math.max(car.speed - config.decel * dt, 0);
		}

		if (car.speed > 0) {
			car.t += (car.speed * dt) / track.totalArcLength;

			const waypointCount = track.waypoints.length;
			const currentIdx = Math.floor((car.t % 1) * waypointCount) % waypointCount;
			const waypointSpacing = track.totalArcLength / waypointCount;

			const currentCurvature = track.waypoints[currentIdx].curvature;
			if (currentCurvature > 0.001) {
				const maxSafeSpeed = config.derailmentCoefficient * Math.sqrt(3600 / currentCurvature);
				if (car.speed > maxSafeSpeed) {
					car.derailed = true;
					car.derailT = car.t;
					car.penaltyRemaining = config.penaltyDuration;
					return;
				}
			}

			const lookAheadCount = Math.ceil((car.speed * 0.3) / waypointSpacing);
			let maxUpcomingCurvature = 0;
			for (let i = 1; i <= lookAheadCount; i++) {
				const idx = (currentIdx + i) % waypointCount;
				if (track.waypoints[idx].curvature > maxUpcomingCurvature) {
					maxUpcomingCurvature = track.waypoints[idx].curvature;
				}
			}

			if (maxUpcomingCurvature > 0.001) {
				const maxSafeAhead = config.derailmentCoefficient * Math.sqrt(3600 / maxUpcomingCurvature);
				if (car.speed > maxSafeAhead) {
					car.speed = Math.max(maxSafeAhead, car.speed - config.decel * 3 * dt);
				}
			}
		}

		if (car.t >= config.laps) {
			car.t = config.laps;
			car.finished = true;
			car.finishTime = Date.now();
			car.speed = 0;
		}
	}

	static getPositionOnTrack(globalT: number, lane: number, track: Track): { x: number; y: number; angle: number } {
		const wrapped = globalT % 1;
		const t = wrapped < 0 ? wrapped + 1 : wrapped;
		const idx = Math.floor(t * track.waypoints.length) % track.waypoints.length;
		const wp = track.waypoints[idx];
		const laneOffset = (lane - (track.laneCount - 1) / 2) * track.laneWidth;
		return {
			x: wp.x - Math.sin(wp.angle) * laneOffset,
			y: wp.y + Math.cos(wp.angle) * laneOffset,
			angle: wp.angle,
		};
	}
}
