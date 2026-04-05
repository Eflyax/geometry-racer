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
import type { BezierSegment, CarState, GridCell, Player, Point, Track } from 'animal-racer-shared';

const props = defineProps<{
	track: Track;
	cars: Array<CarState>;
	players: Array<Player>;
	cell: GridCell;
}>();

const viewBox = computed(() => {
	return `${props.cell.worldOffsetX} ${props.cell.worldOffsetY} ${props.cell.screenWidth} ${props.cell.screenHeight}`;
});

const lanePaths = computed(() => {
	const paths: Array<string> = [];
	for (let lane = 0; lane < props.track.laneCount; lane++) {
		paths.push(buildLanePath(lane));
	}
	return paths;
});

function buildLanePath(lane: number): string {
	const segments = props.track.segments;
	const steps = 50;
	const points: Array<Point> = [];

	for (let segIdx = 0; segIdx < segments.length; segIdx++) {
		const seg = segments[segIdx];
		for (let i = 0; i <= steps; i++) {
			if (segIdx > 0 && i === 0) continue;
			const localT = i / steps;
			const pos = evalBezier(seg, localT);
			const d1 = bezierDerivative1(seg, localT);
			const angle = Math.atan2(d1.y, d1.x);
			const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
			const offset = (lane - (props.track.laneCount - 1) / 2) * props.track.laneWidth;
			points.push({
				x: pos.x + normal.x * offset,
				y: pos.y + normal.y * offset,
			});
		}
	}

	if (points.length === 0) return '';
	let d = `M ${points[0].x} ${points[0].y}`;
	for (let i = 1; i < points.length; i++) {
		d += ` L ${points[i].x} ${points[i].y}`;
	}
	d += ' Z';
	return d;
}

const directionArrows = computed(() => {
	const arrowSpacing = 240; // car size (24) × 10
	const totalLen = props.track.totalArcLength;
	if (totalLen <= 0) return [];

	const count = Math.floor(totalLen / arrowSpacing);
	const halfWidth = (props.track.laneCount * props.track.laneWidth) / 2;
	const arrows: Array<{ d: string }> = [];

	for (let i = 0; i < count; i++) {
		const targetLen = i * arrowSpacing;
		const t = arcLengthToT(targetLen);
		const pos = getCenterlinePosition(t);

		// Normal perpendicular to direction
		const nx = -Math.sin(pos.angle);
		const ny = Math.cos(pos.angle);

		// Forward offset for the chevron tip — larger = wider/flatter angle
		const tipOffset = halfWidth * 0.8;
		const fx = Math.cos(pos.angle) * tipOffset;
		const fy = Math.sin(pos.angle) * tipOffset;

		// Chevron: two lines from ends of the track width to a center tip
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

function arcLengthToT(targetLen: number): number {
	const lut = props.track.arcLengthLUT;
	if (lut.length < 2) return 0;

	// Binary search in LUT
	let lo = 0;
	let hi = lut.length - 1;
	while (lo < hi - 1) {
		const mid = (lo + hi) >> 1;
		if (lut[mid].length < targetLen) lo = mid;
		else hi = mid;
	}

	const segLen = lut[hi].length - lut[lo].length;
	if (segLen < 1e-6) return lut[lo].t;
	const frac = (targetLen - lut[lo].length) / segLen;
	return lut[lo].t + (lut[hi].t - lut[lo].t) * frac;
}

function getCenterlinePosition(globalT: number): { x: number; y: number; angle: number } {
	const t = Math.max(0, Math.min(1, globalT));
	const segCount = props.track.segments.length;
	const segFloat = t * segCount;
	const segIdx = Math.min(Math.floor(segFloat), segCount - 1);
	const localT = segFloat - segIdx;

	const seg = props.track.segments[segIdx];
	const pos = evalBezier(seg, localT);
	const d1 = bezierDerivative1(seg, localT);
	const angle = Math.atan2(d1.y, d1.x);

	return { x: pos.x, y: pos.y, angle };
}

const startFinishLine = computed(() => {
	const seg = props.track.segments[0];
	if (!seg) return { x1: 0, y1: 0, x2: 0, y2: 0 };
	const pos = evalBezier(seg, 0);
	const d1 = bezierDerivative1(seg, 0);
	const angle = Math.atan2(d1.y, d1.x);
	const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
	const spread = props.track.laneCount * props.track.laneWidth;
	return {
		x1: pos.x + normal.x * spread,
		y1: pos.y + normal.y * spread,
		x2: pos.x - normal.x * spread,
		y2: pos.y - normal.y * spread,
	};
});

const carPositions = computed(() => {
	const positions: Record<string, { x: number; y: number; angle: number }> = {};
	for (const car of props.cars) {
		if (car.derailed) {
			positions[car.playerId] = getDerailedPosition(car.derailT, car.lane);
		} else {
			positions[car.playerId] = getPositionOnTrack(car.t, car.lane);
		}
	}
	return positions;
});

function getDerailedPosition(derailT: number, lane: number): { x: number; y: number; angle: number } {
	const base = getPositionOnTrack(derailT, lane);

	// Deterministic pseudo-random from derailT + lane — same result on all clients
	const h1 = Math.sin(derailT * 9301.0 + lane * 4967.0);
	const h2 = Math.sin(derailT * 6271.0 + lane * 3491.0 + 1.0);

	// Perpendicular offset: 1.5–3× car size (car = 24 units)
	const sign = h1 >= 0 ? 1 : -1;
	const offsetNormal = sign * 24 * (1.5 + Math.abs(h1) * 1.5);

	const nx = -Math.sin(base.angle);
	const ny = Math.cos(base.angle);

	// Spin: ±60°–150° from track direction
	const spin = sign * (Math.PI / 3 + Math.abs(h2) * (Math.PI * 5 / 6));

	return {
		x: base.x + nx * offsetNormal,
		y: base.y + ny * offsetNormal,
		angle: base.angle + spin,
	};
}

function getPositionOnTrack(globalT: number, lane: number): { x: number; y: number; angle: number } {
	const t = Math.max(0, Math.min(1, globalT % 1 || (globalT >= 1 ? 1 : 0)));
	const segCount = props.track.segments.length;
	const segFloat = t * segCount;
	const segIdx = Math.min(Math.floor(segFloat), segCount - 1);
	const localT = segFloat - segIdx;

	const seg = props.track.segments[segIdx];
	const pos = evalBezier(seg, localT);
	const d1 = bezierDerivative1(seg, localT);
	const angle = Math.atan2(d1.y, d1.x);
	const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
	const laneOffset = (lane - (props.track.laneCount - 1) / 2) * props.track.laneWidth;

	return {
		x: pos.x + normal.x * laneOffset,
		y: pos.y + normal.y * laneOffset,
		angle,
	};
}

function getPlayerColor(id: string): string {
	return props.players.find((p) => p.id === id)?.color ?? '#666';
}

function evalBezier(seg: BezierSegment, t: number): Point {
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

function bezierDerivative1(seg: BezierSegment, t: number): Point {
	const mt = 1 - t;
	return {
		x: 3 * mt * mt * (seg.p1.x - seg.p0.x) + 6 * mt * t * (seg.p2.x - seg.p1.x) + 3 * t * t * (seg.p3.x - seg.p2.x),
		y: 3 * mt * mt * (seg.p1.y - seg.p0.y) + 6 * mt * t * (seg.p2.y - seg.p1.y) + 3 * t * t * (seg.p3.y - seg.p2.y),
	};
}
</script>

<style scoped>
.track-svg {
	width: 100%;
	height: 100%;
	display: block;
}
</style>
