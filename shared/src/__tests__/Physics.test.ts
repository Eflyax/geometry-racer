import { describe, it, expect } from 'vitest';
import { Physics } from '../Physics.js';
import type { CarState, RoomConfig, Track, Waypoint } from '../types.js';

function makeCircularTrack(radius: number = 500, waypointCount: number = 200): Track {
	const circumference = 2 * Math.PI * radius;
	const waypoints: Array<Waypoint> = [];

	for (let i = 0; i < waypointCount; i++) {
		const angle = (i / waypointCount) * Math.PI * 2;
		const tangentAngle = angle + Math.PI / 2;
		waypoints.push({
			x: Math.cos(angle) * radius,
			y: Math.sin(angle) * radius,
			angle: tangentAngle,
			curvature: 1 / radius,
			cumulativeLength: (i / waypointCount) * circumference,
		});
	}

	return {
		waypoints,
		totalArcLength: circumference,
		laneCount: 1,
		laneWidth: 30,
		worldBounds: { width: 2000, height: 2000 },
	};
}

function makeStraightTrack(length: number = 2000, waypointCount: number = 400): Track {
	const waypoints: Array<Waypoint> = [];

	for (let i = 0; i < waypointCount; i++) {
		waypoints.push({
			x: (i / waypointCount) * length,
			y: 0,
			angle: 0,
			curvature: 0,
			cumulativeLength: (i / waypointCount) * length,
		});
	}

	return {
		waypoints,
		totalArcLength: length,
		laneCount: 1,
		laneWidth: 30,
		worldBounds: { width: 2000, height: 600 },
	};
}

function makeDefaultConfig(): RoomConfig {
	return {
		isPublic: false,
		maxPlayers: 8,
		derailmentCoefficient: 1.0,
		penaltyDuration: 2000,
		wiggliness: 50,
		devMode: false,
		laps: 1,
		accel: 180,
		maxSpeed: 600,
		decel: 400,
	};
}

function makeCar(overrides: Partial<CarState> = {}): CarState {
	return {
		playerId: 'test',
		lane: 0,
		t: 0,
		speed: 0,
		derailed: false,
		penaltyRemaining: 0,
		derailT: 0,
		finished: false,
		finishTime: null,
		...overrides,
	};
}

describe('Physics.getPositionOnTrack', () => {
	it('returns position at track start for t=0', () => {
		const track = makeCircularTrack(500);
		const pos = Physics.getPositionOnTrack(0, 0, track);
		// First waypoint of circle at angle=0 is (radius, 0)
		expect(pos.x).toBeCloseTo(500, 0);
		expect(pos.y).toBeCloseTo(0, 0);
	});

	it('wraps t=1 back to track start', () => {
		const track = makeCircularTrack(500);
		const pos0 = Physics.getPositionOnTrack(0, 0, track);
		const pos1 = Physics.getPositionOnTrack(1, 0, track);
		expect(pos0.x).toBeCloseTo(pos1.x, 0);
		expect(pos0.y).toBeCloseTo(pos1.y, 0);
	});

	it('applies lane offset perpendicular to direction of travel', () => {
		// Straight track going right (angle=0): normal is (0, 1) (up)
		// laneCount=1 so laneOffset=0, both lanes are the same point
		const track = makeStraightTrack();
		// Use a 2-lane track by overriding laneCount
		const track2 = { ...track, laneCount: 2 };
		const lane0 = Physics.getPositionOnTrack(0.5, 0, track2);
		const lane1 = Physics.getPositionOnTrack(0.5, 1, track2);
		// normal to angle=0 is (0,1), so lane offset is along y axis
		expect(lane0.x).toBeCloseTo(lane1.x, 1);
		expect(Math.abs(lane1.y - lane0.y)).toBeCloseTo(track.laneWidth, 0);
	});
});

describe('Physics.updateCar - speed', () => {
	it('accelerates when touching', () => {
		const track = makeStraightTrack();
		const car = makeCar();
		Physics.updateCar(car, true, 0.1, track, makeDefaultConfig());
		expect(car.speed).toBeGreaterThan(0);
		expect(car.derailed).toBe(false);
	});

	it('does not exceed maxSpeed', () => {
		const track = makeStraightTrack();
		const config = makeDefaultConfig();
		const car = makeCar({ speed: config.maxSpeed - 1 });
		Physics.updateCar(car, true, 1.0, track, config);
		expect(car.speed).toBeLessThanOrEqual(config.maxSpeed);
	});

	it('decelerates when not touching', () => {
		const track = makeStraightTrack();
		const car = makeCar({ speed: 300 });
		Physics.updateCar(car, false, 0.1, track, makeDefaultConfig());
		expect(car.speed).toBeLessThan(300);
	});

	it('does not go below zero speed', () => {
		const track = makeStraightTrack();
		const car = makeCar({ speed: 1 });
		Physics.updateCar(car, false, 10, track, makeDefaultConfig());
		expect(car.speed).toBe(0);
	});
});

describe('Physics.updateCar - position advance', () => {
	it('advances t when speed > 0', () => {
		const track = makeStraightTrack();
		const car = makeCar({ speed: 300 });
		const prevT = car.t;
		Physics.updateCar(car, true, 0.1, track, makeDefaultConfig());
		expect(car.t).toBeGreaterThan(prevT);
	});

	it('does not advance t when speed is 0', () => {
		const track = makeStraightTrack();
		const car = makeCar({ speed: 0 });
		Physics.updateCar(car, false, 0.1, track, makeDefaultConfig());
		expect(car.t).toBe(0);
	});
});

describe('Physics.updateCar - derailment', () => {
	it('derails when entering a tight curve too fast', () => {
		// Tight circle radius=50 → curvature=0.02 → maxSafeSpeed=1*sqrt(3600/0.02)=424
		const track = makeCircularTrack(50, 100);
		const car = makeCar({ speed: 600 });
		Physics.updateCar(car, false, 0.016, track, makeDefaultConfig());
		expect(car.derailed).toBe(true);
		expect(car.penaltyRemaining).toBeGreaterThan(0);
	});

	it('does not derail at safe speed on a tight curve', () => {
		const track = makeCircularTrack(50, 100);
		const car = makeCar({ speed: 100 }); // well below maxSafeSpeed ~424
		Physics.updateCar(car, false, 0.016, track, makeDefaultConfig());
		expect(car.derailed).toBe(false);
	});

	it('counts down penalty timer each tick', () => {
		const track = makeStraightTrack();
		const car = makeCar({ derailed: true, penaltyRemaining: 1000, derailT: 0.1, t: 0.1 });
		Physics.updateCar(car, false, 0.1, track, makeDefaultConfig()); // dt=0.1 → -100ms
		expect(car.penaltyRemaining).toBeCloseTo(900, 0);
		expect(car.derailed).toBe(true);
	});

	it('recovers from derailment when penalty expires', () => {
		const track = makeStraightTrack();
		const car = makeCar({ derailed: true, penaltyRemaining: 50, derailT: 0.2, t: 0.2 });
		Physics.updateCar(car, false, 0.1, track, makeDefaultConfig()); // dt=0.1 → -100ms → penalty < 0
		expect(car.derailed).toBe(false);
		expect(car.speed).toBe(0);
		expect(car.t).toBe(0.2);
	});
});

describe('Physics.updateCar - finish', () => {
	it('finishes when t reaches laps', () => {
		const track = makeStraightTrack();
		const config = makeDefaultConfig();
		const car = makeCar({ t: 0.999, speed: 600 });
		Physics.updateCar(car, true, 0.1, track, config);
		expect(car.finished).toBe(true);
		expect(car.finishTime).not.toBeNull();
		expect(car.speed).toBe(0);
	});

	it('does not move after finishing', () => {
		const track = makeStraightTrack();
		const car = makeCar({ finished: true, t: 1.0, speed: 0 });
		Physics.updateCar(car, true, 1.0, track, makeDefaultConfig());
		expect(car.t).toBe(1.0);
	});
});
