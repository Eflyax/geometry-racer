<template>
	<div
		class="race"
		@touchstart.prevent="store.touchStart()"
		@touchend.prevent="store.touchEnd()"
		@mousedown.prevent="store.touchStart()"
		@mouseup.prevent="store.touchEnd()"
	>
		<TrackSvg
			v-if="store.track && store.myCell"
			:track="store.track"
			:cars="store.cars"
			:players="store.players"
			:cell="store.myCell"
		/>

		<div v-if="store.myCar?.derailed" class="penalty-overlay">
			<p>Vykolejení!</p>
			<p class="penalty-time">{{ Math.ceil((store.myCar.penaltyRemaining) / 1000) }}s</p>
		</div>

		<div v-if="store.phase === 'finished'" class="results-overlay">
			<h2>Výsledky</h2>
			<div v-for="(r, i) in store.rankings" :key="r.playerId" class="result-row">
				<span class="rank">{{ i + 1 }}.</span>
				<span class="result-color" :style="{ background: getPlayerColor(r.playerId) }"></span>
				<span class="result-name">{{ getPlayerName(r.playerId) }}</span>
				<span class="result-time">{{ formatTime(r.finishTime) }}</span>
			</div>
			<button
				v-if="store.isHost"
				class="btn btn-lobby"
				@click.stop="store.backToLobby()"
			>
				Zpět do lobby
			</button>
			<p v-else class="waiting">Čekám na hosta...</p>
		</div>

		<div class="speed-indicator" v-if="store.myCar && !store.myCar.finished">
			<div class="speed-bar" :style="{ width: speedPercent + '%' }"></div>
		</div>

		<div
			v-if="store.config.devMode && store.isHost"
			class="dev-panel"
			@mousedown.stop
			@mouseup.stop
			@touchstart.stop
			@touchend.stop
		>
			<button class="btn-dev-restart" @click="store.devRestart()">Restart</button>
			<label>
				Zrychlení: {{ store.config.accel }}
				<input type="range" min="100" max="2000" step="50" :value="store.config.accel"
					@input="store.updateConfig({ accel: Number(($event.target as HTMLInputElement).value) })" />
			</label>
			<label>
				Citlivost vyjetí: {{ store.config.derailmentCoefficient.toFixed(1) }}
				<input type="range" min="0.1" max="5" step="0.1" :value="store.config.derailmentCoefficient"
					@input="store.updateConfig({ derailmentCoefficient: Number(($event.target as HTMLInputElement).value) })" />
			</label>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '@/store/game';
import { MAX_SPEED } from 'animal-racer-shared';
import TrackSvg from '@/components/TrackSvg.vue';

const store = useGameStore();
const router = useRouter();

watch(() => store.phase, (p) => {
	if (p === 'lobby') {
		router.push('/lobby');
	}
});

const speedPercent = computed(() => {
	if (!store.myCar) return 0;
	return (store.myCar.speed / MAX_SPEED) * 100;
});

function getPlayerName(id: string): string {
	return store.players.find((p) => p.id === id)?.name ?? '?';
}

function getPlayerColor(id: string): string {
	return store.players.find((p) => p.id === id)?.color ?? '#666';
}

function formatTime(ms: number): string {
	const firstFinish = store.rankings[0]?.finishTime ?? ms;
	const diff = (ms - firstFinish) / 1000;
	if (diff === 0) return 'Winner!';
	return `+${diff.toFixed(2)}s`;
}
</script>

<style scoped>
.race {
	width: 100%;
	height: 100%;
	position: relative;
	background: #0f0f23;
	touch-action: none;
	user-select: none;
	-webkit-user-select: none;
}

.penalty-overlay {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	text-align: center;
	color: #f44336;
	font-size: 1.5rem;
	font-weight: bold;
	background: rgba(0, 0, 0, 0.7);
	padding: 20px 40px;
	border-radius: 12px;
	pointer-events: none;
}

.penalty-time {
	font-size: 3rem;
}

.results-overlay {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	background: rgba(0, 0, 0, 0.9);
	padding: 24px 32px;
	border-radius: 16px;
	min-width: 280px;
}

.results-overlay h2 {
	text-align: center;
	margin-bottom: 1rem;
}

.result-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 0;
	border-bottom: 1px solid #333;
}

.rank {
	font-weight: bold;
	width: 30px;
}

.result-color {
	width: 16px;
	height: 16px;
	border-radius: 50%;
}

.result-name {
	flex: 1;
}

.result-time {
	color: #4CAF50;
	font-weight: 600;
}

.speed-indicator {
	position: absolute;
	bottom: 10px;
	left: 10px;
	right: 10px;
	height: 6px;
	background: #333;
	border-radius: 3px;
	overflow: hidden;
	pointer-events: none;
}

.speed-bar {
	height: 100%;
	background: linear-gradient(90deg, #4CAF50, #FFEB3B, #f44336);
	transition: width 0.1s;
	border-radius: 3px;
}

.btn-lobby {
	display: block;
	width: 100%;
	margin-top: 1rem;
	padding: 12px;
	border: none;
	border-radius: 8px;
	font-size: 1rem;
	font-weight: 600;
	cursor: pointer;
	background: linear-gradient(135deg, #3F51B5, #03A9F4);
	color: white;
}

.waiting {
	text-align: center;
	color: #999;
	font-style: italic;
	margin-top: 1rem;
}

.dev-panel {
	position: absolute;
	top: 10px;
	right: 10px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	background: rgba(0, 0, 0, 0.75);
	padding: 10px;
	border-radius: 8px;
	z-index: 10;
	max-width: 200px;
}

.dev-panel label {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.75rem;
	color: #ccc;
}

.dev-panel input[type="range"] {
	width: 100%;
}

.btn-dev-restart {
	padding: 6px 12px;
	border: none;
	border-radius: 6px;
	font-size: 0.8rem;
	font-weight: 600;
	cursor: pointer;
	background: #FF6B35;
	color: white;
}
</style>
