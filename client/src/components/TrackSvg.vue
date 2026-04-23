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

	const parts: Array<string> = [];
	for (let i = 0; i < waypoints.length; i++) {
		const wp = waypoints[i];
		const x = wp.x - Math.sin(wp.angle) * offset;
		const y = wp.y + Math.cos(wp.angle) * offset;
		parts.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
	}
	return parts.join(' ') + ' Z';
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
	const wrapped = globalT % 1;
	const t = wrapped < 0 ? wrapped + 1 : wrapped;
	const idx = Math.floor(t * props.track.waypoints.length) % props.track.waypoints.length;
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
	const wrapped = globalT % 1;
	const t = wrapped < 0 ? wrapped + 1 : wrapped;
	const idx = Math.floor(t * props.track.waypoints.length) % props.track.waypoints.length;
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
