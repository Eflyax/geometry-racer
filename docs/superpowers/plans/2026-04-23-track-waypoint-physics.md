# Track Waypoint Physics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bézier-segment track representation with a dense waypoint polyline to fix visual speed artifacts (A) and add smooth curve-speed limiting (B).

**Architecture:** `TrackGenerator` continues generating Bézier curves internally, then samples them into a dense `Waypoint[]` array (one point per ~5 px of arc). `Physics` and `TrackSvg` both operate on waypoints via direct array index lookup — no Bézier math at runtime.

**Tech Stack:** TypeScript, Vitest (unit tests for shared), Vue 3, SVG rendering unchanged.

---

## File Map

| File | Change |
|---|---|
| `shared/package.json` | Add `vitest` devDependency and `test` script |
| `shared/vitest.config.ts` | New — Vitest config |
| `shared/src/types.ts` | Add `Waypoint`, update `Track`, remove `BezierSegment` |
| `shared/src/Physics.ts` | Full rewrite — waypoint-based position, speed, curvature |
| `shared/src/index.ts` | No change needed (re-exports everything from types/Physics) |
| `shared/src/__tests__/Physics.test.ts` | New — unit tests |
| `server/src/TrackGenerator.ts` | Move `BezierSegment` local, add `sampleWaypoints` + `lutLengthToT` |
| `client/src/components/TrackSvg.vue` | Rewrite all Bézier helpers to waypoint lookups |

---

## Task 1: Vitest setup in shared package

**Files:**
- Modify: `shared/package.json`
- Create: `shared/vitest.config.ts`

- [ ] **Step 1: Add vitest to shared/package.json**

Replace the contents of `shared/package.json` with:

```json
{
	"name": "animal-racer-shared",
	"version": "1.0.0",
	"private": true,
	"type": "module",
	"scripts": {
		"build": "tsc",
		"test": "vitest run"
	},
	"main": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"exports": {
		".": {
			"import": "./dist/index.js",
			"types": "./dist/index.d.ts"
		}
	},
	"devDependencies": {
		"vitest": "^2.0.0",
		"typescript": "^5.6.0"
	}
}
```

- [ ] **Step 2: Create shared/vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
	},
});
```

- [ ] **Step 3: Install vitest**

Run from repo root:
```bash
npm install
```

- [ ] **Step 4: Verify vitest is available**

```bash
cd shared && npx vitest --version
```

Expected: prints a version number (e.g. `2.x.x`)

---

## Task 2: Update shared/src/types.ts

**Files:**
- Modify: `shared/src/types.ts`

- [ ] **Step 1: Write the failing type-check**

Create `shared/src/__tests__/Physics.test.ts` with a minimal import to anchor types:

```ts
import { describe, it } from 'vitest';
import type { Track, Waypoint } from '../types.js';

describe('types placeholder', () => {
	it('Waypoint and Track exist', () => {
		const wp: Waypoint = {
			x: 0,
			y: 0,
			angle: 0,
			curvature: 0,
			cumulativeLength: 0,
		};
		const t: Track = {
			waypoints: [wp],
			totalArcLength: 100,
			laneCount: 1,
			laneWidth: 30,
			worldBounds: { width: 800, height: 600 },
		};
		// compile-time check only
		void t;
	});
});
```

- [ ] **Step 2: Run test — expect TypeScript error (Waypoint not found)**

```bash
cd shared && npm test
```

Expected: fails with `Cannot find name 'Waypoint'` or similar type error.

- [ ] **Step 3: Replace shared/src/types.ts**

```ts
export interface Point {
	x: number;
	y: number;
}

export interface ScreenInfo {
	width: number;
	height: number;
	devicePixelRatio: number;
}

export interface GridCell {
	playerId: string;
	gridX: number;
	gridY: number;
	worldOffsetX: number;
	worldOffsetY: number;
	screenWidth: number;
	screenHeight: number;
}

export interface PairingEdge {
	tokenId: string;
	color: string;
	side: 'top' | 'right' | 'bottom' | 'left';
	neighborPlayerId: string;
}

export interface Waypoint {
	x: number;
	y: number;
	angle: number;
	curvature: number;
	cumulativeLength: number;
}

export interface Track {
	waypoints: Array<Waypoint>;
	totalArcLength: number;
	laneCount: number;
	laneWidth: number;
	worldBounds: { width: number; height: number };
}

export interface CarState {
	playerId: string;
	lane: number;
	t: number;
	speed: number;
	derailed: boolean;
	penaltyRemaining: number;
	derailT: number;
	finished: boolean;
	finishTime: number | null;
}

export interface RoomConfig {
	isPublic: boolean;
	maxPlayers: number;
	derailmentCoefficient: number;
	penaltyDuration: number;
	wiggliness: number;
	devMode: boolean;
	laps: number;
	accel: number;
	maxSpeed: number;
	decel: number;
}

export type GamePhase = 'lobby' | 'measuring' | 'pairing' | 'racing' | 'finished';

export interface Player {
	id: string;
	name: string;
	color: string;
	lane: number;
	screen: ScreenInfo | null;
	pairingConfirmed: boolean;
}

export interface RoomState {
	code: string;
	phase: GamePhase;
	hostId: string;
	config: RoomConfig;
	players: Array<Player>;
	grid: Array<GridCell>;
	track: Track | null;
	cars: Array<CarState>;
}

export const PLAYER_COLORS = [
	'#FF6B35',
	'#E91E63',
	'#9C27B0',
	'#3F51B5',
	'#03A9F4',
	'#009688',
	'#4CAF50',
	'#FFEB3B',
	'#FF9800',
	'#795548',
] as const;
```

- [ ] **Step 4: Run the placeholder test — expect it to pass**

```bash
cd shared && npm test
```

Expected: `1 test passed`

- [ ] **Step 5: Commit**

```bash
git add shared/package.json shared/vitest.config.ts shared/src/types.ts shared/src/__tests__/Physics.test.ts
git commit -m "feat: add Waypoint type, update Track shape, drop BezierSegment"
```

---

## Task 3: Rewrite shared/src/Physics.ts

**Files:**
- Modify: `shared/src/Physics.ts`
- Modify: `shared/src/__tests__/Physics.test.ts`

- [ ] **Step 1: Replace Physics.test.ts with full test suite**

```ts
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
```

- [ ] **Step 2: Run tests — expect failures (Physics methods not yet updated)**

```bash
cd shared && npm test
```

Expected: multiple failures referencing `getPositionOnTrack` or type errors.

- [ ] **Step 3: Replace shared/src/Physics.ts**

```ts
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
		const t = Math.max(0, Math.min(1, globalT % 1 || (globalT >= 1 ? 1 : 0)));
		const idx = Math.min(Math.floor(t * track.waypoints.length), track.waypoints.length - 1);
		const wp = track.waypoints[idx];
		const laneOffset = (lane - (track.laneCount - 1) / 2) * track.laneWidth;
		return {
			x: wp.x - Math.sin(wp.angle) * laneOffset,
			y: wp.y + Math.cos(wp.angle) * laneOffset,
			angle: wp.angle,
		};
	}
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
cd shared && npm test
```

Expected: `X tests passed` (all green). If any fail, fix before proceeding.

- [ ] **Step 5: Commit**

```bash
git add shared/src/Physics.ts shared/src/__tests__/Physics.test.ts
git commit -m "feat: rewrite Physics to use waypoint array — fixes arc-length uniformity and adds lookahead curve decel"
```

---

## Task 4: Update TrackGenerator to produce waypoints

**Files:**
- Modify: `server/src/TrackGenerator.ts`

- [ ] **Step 1: Replace server/src/TrackGenerator.ts**

`BezierSegment` is moved here as a local interface. Two new private methods are added: `sampleWaypoints` and `lutLengthToT`. The `generate` method now returns a `Track` with `waypoints` instead of `segments` + `arcLengthLUT`.

```ts
import type { Point, Track, Waypoint } from 'animal-racer-shared';
import { LANE_WIDTH } from 'animal-racer-shared';

const MAX_TURN_DEG = 120;
const MAX_TURN_RAD = MAX_TURN_DEG * Math.PI / 180;
const WAYPOINT_SPACING = 5;

interface BezierSegment {
	p0: Point;
	p1: Point;
	p2: Point;
	p3: Point;
	arcLength: number;
}

export class TrackGenerator {
	private margin = 0;
	private worldWidth = 0;
	private worldHeight = 0;

	generate(worldWidth: number, worldHeight: number, laneCount: number, wiggliness: number = 50): Track {
		this.worldWidth = worldWidth;
		this.worldHeight = worldHeight;
		this.margin = 30 + LANE_WIDTH * laneCount;

		const segments = this.generateClosedLoop(wiggliness);
		const lut = this.buildArcLengthLUT(segments);
		const totalArcLength = lut[lut.length - 1]?.length ?? 0;
		const waypoints = this.sampleWaypoints(segments, lut, totalArcLength);

		return {
			waypoints,
			totalArcLength,
			laneCount,
			laneWidth: LANE_WIDTH,
			worldBounds: { width: worldWidth, height: worldHeight },
		};
	}

	private sampleWaypoints(
		segments: Array<BezierSegment>,
		lut: Array<{ t: number; length: number }>,
		totalArcLength: number,
	): Array<Waypoint> {
		const count = Math.max(8, Math.round(totalArcLength / WAYPOINT_SPACING));
		const pts: Array<{ x: number; y: number }> = [];

		for (let i = 0; i < count; i++) {
			const targetLen = (i / count) * totalArcLength;
			const globalT = this.lutLengthToT(lut, targetLen);
			const segCount = segments.length;
			const segFloat = globalT * segCount;
			const segIdx = Math.min(Math.floor(segFloat), segCount - 1);
			const localT = segFloat - segIdx;
			pts.push(this.evalBezier(segments[segIdx].p0, segments[segIdx].p1, segments[segIdx].p2, segments[segIdx].p3, localT));
		}

		const waypoints: Array<Waypoint> = pts.map((pt, i) => {
			const next = pts[(i + 1) % pts.length];
			return {
				x: pt.x,
				y: pt.y,
				angle: Math.atan2(next.y - pt.y, next.x - pt.x),
				curvature: 0,
				cumulativeLength: (i / count) * totalArcLength,
			};
		});

		for (let i = 0; i < waypoints.length; i++) {
			const prev = waypoints[(i - 1 + waypoints.length) % waypoints.length];
			const next = waypoints[(i + 1) % waypoints.length];
			let da = next.angle - prev.angle;
			while (da > Math.PI) { da -= 2 * Math.PI; }
			while (da < -Math.PI) { da += 2 * Math.PI; }
			waypoints[i].curvature = Math.abs(da) / (2 * WAYPOINT_SPACING);
		}

		return waypoints;
	}

	private lutLengthToT(lut: Array<{ t: number; length: number }>, targetLen: number): number {
		if (lut.length < 2) return 0;
		let lo = 0;
		let hi = lut.length - 1;
		while (lo < hi - 1) {
			const mid = (lo + hi) >> 1;
			if (lut[mid].length < targetLen) { lo = mid; }
			else { hi = mid; }
		}
		const segLen = lut[hi].length - lut[lo].length;
		if (segLen < 1e-6) return lut[lo].t;
		const frac = (targetLen - lut[lo].length) / segLen;
		return lut[lo].t + (lut[hi].t - lut[lo].t) * frac;
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

		const perSide = Math.round(3 + w * 4) + Math.floor(Math.random() * 2);

		const waypoints: Array<Point> = [];

		const maxInwardFrac = 0.1 + w * 0.7;

		for (let i = 0; i < perSide; i++) {
			const frac = (i + 0.5) / perSide;
			const inward = Math.random() * maxInwardFrac * halfH;
			waypoints.push({ x: left + (right - left) * frac, y: top + inward });
		}
		for (let i = 0; i < perSide; i++) {
			const frac = (i + 0.5) / perSide;
			const inward = Math.random() * maxInwardFrac * halfW;
			waypoints.push({ x: right - inward, y: top + (bottom - top) * frac });
		}
		for (let i = 0; i < perSide; i++) {
			const frac = 1 - (i + 0.5) / perSide;
			const inward = Math.random() * maxInwardFrac * halfH;
			waypoints.push({ x: left + (right - left) * frac, y: bottom - inward });
		}
		for (let i = 0; i < perSide; i++) {
			const frac = 1 - (i + 0.5) / perSide;
			const inward = Math.random() * maxInwardFrac * halfW;
			waypoints.push({ x: left + inward, y: top + (bottom - top) * frac });
		}

		this.clampPoints(waypoints);

		const smoothed = this.smoothSharpTurns(waypoints);

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

		for (let iter = 0; iter < 30; iter++) {
			let anySharp = false;

			for (let i = 0; i < pts.length; i++) {
				const prev = pts[(i - 1 + pts.length) % pts.length];
				const curr = pts[i];
				const nxt = pts[(i + 1) % pts.length];
				const angle = this.turnAngle(prev, curr, nxt);

				if (angle > MAX_TURN_RAD) {
					anySharp = true;
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
```

- [ ] **Step 2: Build shared and server to verify no TypeScript errors**

```bash
npm run build:shared
cd server && npm run build
```

Expected: both compile without errors.

- [ ] **Step 3: Run unit tests to verify Physics still passes**

```bash
cd shared && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/TrackGenerator.ts
git commit -m "feat: TrackGenerator samples waypoints from Bezier curves at generation time"
```

---

## Task 5: Update client/src/components/TrackSvg.vue

**Files:**
- Modify: `client/src/components/TrackSvg.vue`

- [ ] **Step 1: Build shared so client can use updated types**

```bash
npm run build:shared
```

- [ ] **Step 2: Replace TrackSvg.vue**

All Bézier helper functions (`evalBezier`, `bezierDerivative1`) are removed. `arcLengthToT` is replaced by a direct division. All position lookups use waypoint array index.

```vue
<template>
	<svg
		:viewBox="viewBox"
		class="track-svg"
		xmlns="http://www.w3.org/2000/svg"
	>
		<!-- Track lanes -->
		<path
			v-for="(lanePath, i) in lanePaths"
			:key="'lane-' + i"
			:d="lanePath"
			fill="none"
			stroke="#2a2a4a"
			:stroke-width="track.laneWidth * 0.8"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<path
			v-for="(lanePath, i) in lanePaths"
			:key="'lane-center-' + i"
			:d="lanePath"
			fill="none"
			stroke="#3a3a5a"
			stroke-width="1"
			stroke-dasharray="6 6"
		/>

		<!-- Glow filter -->
		<defs>
			<filter id="arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
				<feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
				<feMerge>
					<feMergeNode in="blur" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
		</defs>

		<!-- Direction arrows -->
		<path
			v-for="(arrow, i) in directionArrows"
			:key="'arrow-' + i"
			:d="arrow.d"
			fill="none"
			stroke="#ea00ff"
			stroke-width="4"
			stroke-linecap="round"
			stroke-linejoin="round"
			filter="url(#arrow-glow)"
			style="pointer-events: none"
		/>

		<!-- Start/finish line -->
		<line
			:x1="startFinishLine.x1" :y1="startFinishLine.y1"
			:x2="startFinishLine.x2" :y2="startFinishLine.y2"
			stroke="#FFEB3B" stroke-width="4" stroke-dasharray="8 4"
		/>

		<!-- Cars -->
		<g v-for="car in cars" :key="car.playerId">
			<rect
				v-if="carPositions[car.playerId]"
				:x="carPositions[car.playerId]!.x - 12"
				:y="carPositions[car.playerId]!.y - 6"
				width="24"
				height="12"
				rx="3"
				:fill="car.derailed ? '#666' : getPlayerColor(car.playerId)"
				:opacity="car.derailed ? 0.4 : 1"
				:transform="`rotate(${carPositions[car.playerId]!.angle * 180 / Math.PI}, ${carPositions[car.playerId]!.x}, ${carPositions[car.playerId]!.y})`"
			/>
		</g>
	</svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CarState, GridCell, Player, Track } from 'animal-racer-shared';

const props = defineProps<{
	track: Track;
	cars: Array<CarState>;
	players: Array<Player>;
	cell: GridCell;
	myPlayerId: string;
	predictedCar: CarState | null;
	renderCars: Record<string, CarState>;
}>();

const viewBox = computed(() =>
	`${props.cell.worldOffsetX} ${props.cell.worldOffsetY} ${props.cell.screenWidth} ${props.cell.screenHeight}`
);

const lanePaths = computed(() => {
	const paths: Array<string> = [];
	for (let lane = 0; lane < props.track.laneCount; lane++) {
		paths.push(buildLanePath(lane));
	}
	return paths;
});

function buildLanePath(lane: number): string {
	const { waypoints } = props.track;
	if (waypoints.length === 0) return '';
	const offset = (lane - (props.track.laneCount - 1) / 2) * props.track.laneWidth;

	let d = '';
	for (let i = 0; i < waypoints.length; i++) {
		const wp = waypoints[i];
		const x = wp.x - Math.sin(wp.angle) * offset;
		const y = wp.y + Math.cos(wp.angle) * offset;
		d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
	}
	return d + ' Z';
}

const directionArrows = computed(() => {
	const arrowSpacing = 240;
	const totalLen = props.track.totalArcLength;
	if (totalLen <= 0) return [];

	const count = Math.floor(totalLen / arrowSpacing);
	const halfWidth = (props.track.laneCount * props.track.laneWidth) / 2;
	const arrows: Array<{ d: string }> = [];

	for (let i = 0; i < count; i++) {
		const t = (i * arrowSpacing) / totalLen;
		const pos = getCenterlinePosition(t);

		const nx = -Math.sin(pos.angle);
		const ny = Math.cos(pos.angle);
		const tipOffset = halfWidth * 0.8;
		const fx = Math.cos(pos.angle) * tipOffset;
		const fy = Math.sin(pos.angle) * tipOffset;

		const x1 = pos.x + nx * halfWidth;
		const y1 = pos.y + ny * halfWidth;
		const x2 = pos.x + fx;
		const y2 = pos.y + fy;
		const x3 = pos.x - nx * halfWidth;
		const y3 = pos.y - ny * halfWidth;

		arrows.push({ d: `M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3}` });
	}

	return arrows;
});

function getCenterlinePosition(globalT: number): { x: number; y: number; angle: number } {
	const t = Math.max(0, Math.min(1, globalT));
	const idx = Math.min(Math.floor(t * props.track.waypoints.length), props.track.waypoints.length - 1);
	const wp = props.track.waypoints[idx];
	return { x: wp.x, y: wp.y, angle: wp.angle };
}

const startFinishLine = computed(() => {
	const wp = props.track.waypoints[0];
	if (!wp) return { x1: 0, y1: 0, x2: 0, y2: 0 };
	const spread = props.track.laneCount * props.track.laneWidth;
	const nx = -Math.sin(wp.angle);
	const ny = Math.cos(wp.angle);
	return {
		x1: wp.x + nx * spread,
		y1: wp.y + ny * spread,
		x2: wp.x - nx * spread,
		y2: wp.y - ny * spread,
	};
});

const carPositions = computed(() => {
	const positions: Record<string, { x: number; y: number; angle: number }> = {};
	for (const car of props.cars) {
		let source: CarState;
		if (car.playerId === props.myPlayerId && props.predictedCar) {
			source = props.predictedCar;
		} else {
			source = props.renderCars[car.playerId] ?? car;
		}
		const t = source.derailed ? source.derailT : source.t;
		positions[car.playerId] = getPositionOnTrack(t, source.lane);
	}
	return positions;
});

function getPositionOnTrack(globalT: number, lane: number): { x: number; y: number; angle: number } {
	const t = Math.max(0, Math.min(1, globalT % 1 || (globalT >= 1 ? 1 : 0)));
	const idx = Math.min(Math.floor(t * props.track.waypoints.length), props.track.waypoints.length - 1);
	const wp = props.track.waypoints[idx];
	const laneOffset = (lane - (props.track.laneCount - 1) / 2) * props.track.laneWidth;
	return {
		x: wp.x - Math.sin(wp.angle) * laneOffset,
		y: wp.y + Math.cos(wp.angle) * laneOffset,
		angle: wp.angle,
	};
}

function getPlayerColor(id: string): string {
	return props.players.find(p => p.id === id)?.color ?? '#666';
}
</script>

<style scoped>
.track-svg {
	width: 100%;
	height: 100%;
	display: block;
}
</style>
```

- [ ] **Step 3: Type-check the client**

```bash
cd client && npx vue-tsc --noEmit
```

Expected: no errors. If there are import errors for `BezierSegment`, verify it was removed from `shared/src/types.ts`.

- [ ] **Step 4: Start the dev server and visually verify**

In one terminal:
```bash
npm run dev:server
```
In another:
```bash
npm run dev:client
```

Open the game, start a race, verify:
- Track renders correctly (smooth curves, visible lanes, arrows, start line)
- Car moves at constant visual speed on straights
- Car visibly slows when approaching tight curves (lookahead decel)
- Derailment still occurs when entering a curve too fast
- No console errors

- [ ] **Step 5: Commit**

```bash
git add client/src/components/TrackSvg.vue
git commit -m "feat: rewrite TrackSvg to use waypoint array — removes all Bezier sampling at render time"
```

---

## Self-Review Checklist

- [x] Spec requirement A (visual arc-length artifact): fixed by Task 3 (waypoint index lookup is naturally uniform)
- [x] Spec requirement B (smooth curve decel): fixed by Task 3 (lookahead forced decel) + Task 4 (stable curvature values)
- [x] `Waypoint` type defined before any task references it (Task 2)
- [x] `BezierSegment` removed from shared and defined locally in TrackGenerator (Task 4)
- [x] `arcLengthLUT` removed from `Track` type and from TrackSvg (replaced by division in Task 5)
- [x] `game.ts` not modified — it only uses `Physics.updateCar` and `Track` as an opaque ref, no segment access
- [x] All code steps show complete file contents, no placeholders
