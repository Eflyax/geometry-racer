<template>
	<div class="lobby">
		<div class="header">
			<h2>Místnost: <span class="code">{{ store.roomCode }}</span></h2>
			<button class="btn-qr" @click="showQr = !showQr">QR</button>
		</div>

		<div v-if="showQr" class="qr-container">
			<canvas ref="qrCanvas"></canvas>
		</div>

		<div class="players">
			<div
				v-for="player in store.players"
				:key="player.id"
				class="player-card"
			>
				<div class="player-color" :style="{ background: player.color }"></div>
				<span class="player-name">
					{{ player.name }}
					<span v-if="player.id === store.hostId" class="host-badge">HOST</span>
					<span v-if="player.id === store.myPlayerId" class="you-badge">TY</span>
				</span>
			</div>
		</div>

		<div class="color-picker">
			<span class="label">Barva:</span>
			<button
				v-for="color in PLAYER_COLORS"
				:key="color"
				class="color-btn"
				:class="{ selected: store.myPlayer?.color === color, taken: isColorTaken(color) }"
				:style="{ background: color }"
				:disabled="isColorTaken(color)"
				@click="store.selectColor(color)"
			></button>
		</div>

		<div v-if="store.isHost" class="config">
			<label>
				Max hráčů: {{ store.config.maxPlayers }}
				<input type="range" min="2" max="12" :value="store.config.maxPlayers"
					@input="store.updateConfig({ maxPlayers: Number(($event.target as HTMLInputElement).value) })" />
			</label>
			<label>
				Obtížnost zatáček: {{ store.config.derailmentCoefficient.toFixed(1) }}
				<input type="range" min="0.3" max="3" step="0.1" :value="store.config.derailmentCoefficient"
					@input="store.updateConfig({ derailmentCoefficient: Number(($event.target as HTMLInputElement).value) })" />
			</label>
			<label>
				Penalizace (ms): {{ store.config.penaltyDuration }}
				<input type="range" min="500" max="5000" step="100" :value="store.config.penaltyDuration"
					@input="store.updateConfig({ penaltyDuration: Number(($event.target as HTMLInputElement).value) })" />
			</label>
			<label>
				Klikatost: {{ store.config.wiggliness }}
				<input type="range" min="1" max="100" step="1" :value="store.config.wiggliness"
					@input="store.updateConfig({ wiggliness: Number(($event.target as HTMLInputElement).value) })" />
			</label>
			<label>
				Počet kol: {{ store.config.laps }}
				<input type="range" min="1" max="10" step="1" :value="store.config.laps"
					@input="updateLaps(Number(($event.target as HTMLInputElement).value))" />
			</label>
			<label v-if="isDevPlayer" class="checkbox-label">
				<input type="checkbox" :checked="store.config.devMode"
					@change="store.updateConfig({ devMode: ($event.target as HTMLInputElement).checked })" />
				Developer
			</label>
		</div>

		<div v-if="store.isHost" class="btn-wrapper" :title="startTooltip">
			<button
				class="btn btn-start"
				:disabled="!!startTooltip"
				@click="store.startGame()"
			>
				Start
			</button>
		</div>

		<p v-else class="waiting">Čekám na hosta...</p>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '@/store/game';
import { PLAYER_COLORS } from 'animal-racer-shared';
import QRCode from 'qrcode';

const store = useGameStore();
const router = useRouter();
const showQr = ref(false);
const qrCanvas = ref<HTMLCanvasElement | null>(null);

const startTooltip = computed(() => {
	const minPlayers = store.config.devMode ? 1 : 2;
	if (store.players.length < minPlayers) {
		const need = minPlayers - store.players.length;
		return `Potřeba ještě ${need} ${need === 1 ? 'hráče' : 'hráčů'} (min. ${minPlayers})`;
	}
	return '';
});

const isDevPlayer = computed(() => {
	return store.myPlayer?.name === import.meta.env.VITE_DEVELOPER_NAME;
});

function isColorTaken(color: string): boolean {
	return store.players.some((p) => p.color === color && p.id !== store.myPlayerId);
}

function updateLaps(value: number): void {
	store.updateConfig({ laps: value });
	localStorage.setItem('laps', String(value));
}

watch(() => store.phase, (phase) => {
	if (phase === 'measuring' || phase === 'pairing') {
		store.sendScreenInfo();
		router.push('/pairing');
	}
});

watch(showQr, async (val) => {
	if (val) {
		await nextTick();
		if (qrCanvas.value) {
			const joinUrl = `${window.location.origin}/join/${store.roomCode}`;
			QRCode.toCanvas(qrCanvas.value, joinUrl, { width: 200, margin: 2, color: { dark: '#eee', light: '#1a1a2e' } });
		}
	}
});

onMounted(() => {
	const savedLaps = localStorage.getItem('laps');
	if (savedLaps && store.isHost) {
		const laps = Math.max(1, Math.min(10, Number(savedLaps)));
		store.updateConfig({ laps });
	}

	if (!store.roomCode) {
		router.push('/');
	}
});
</script>

<style scoped>
.lobby {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 20px;
	height: 100%;
	overflow-y: auto;
}

.header {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 1rem;
}

.code {
	font-family: monospace;
	font-size: 1.5rem;
	color: #FF6B35;
	letter-spacing: 0.2em;
}

.btn-qr {
	padding: 6px 12px;
	background: #333;
	color: #eee;
	border: none;
	border-radius: 6px;
	cursor: pointer;
}

.qr-container {
	margin-bottom: 1rem;
}

.players {
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 100%;
	max-width: 320px;
	margin-bottom: 1rem;
}

.player-card {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 16px;
	background: #16213e;
	border-radius: 8px;
}

.player-color {
	width: 24px;
	height: 24px;
	border-radius: 50%;
}

.player-name {
	flex: 1;
	display: flex;
	align-items: center;
	gap: 8px;
}

.host-badge, .you-badge {
	font-size: 0.7rem;
	padding: 2px 6px;
	border-radius: 4px;
	font-weight: 600;
}

.host-badge { background: #FF6B35; color: white; }
.you-badge { background: #3F51B5; color: white; }

.color-picker {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 1rem;
	flex-wrap: wrap;
	justify-content: center;
}

.label {
	font-size: 0.9rem;
	color: #999;
}

.color-btn {
	width: 32px;
	height: 32px;
	border-radius: 50%;
	border: 3px solid transparent;
	cursor: pointer;
	transition: border-color 0.2s, opacity 0.2s;
}

.color-btn.selected {
	border-color: white;
}

.color-btn.taken {
	opacity: 0.2;
	cursor: not-allowed;
}

.config {
	display: flex;
	flex-direction: column;
	gap: 12px;
	width: 100%;
	max-width: 320px;
	margin-bottom: 1rem;
}

.config label {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 0.9rem;
	color: #ccc;
}

.config input[type="range"] {
	width: 100%;
}

.checkbox-label {
	flex-direction: row !important;
	align-items: center !important;
	gap: 8px !important;
}

.btn {
	padding: 14px 40px;
	border: none;
	border-radius: 8px;
	font-size: 1.1rem;
	font-weight: 600;
	cursor: pointer;
}

.btn-start {
	background: linear-gradient(135deg, #4CAF50, #009688);
	color: white;
}

.btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
	pointer-events: none;
}

.btn-wrapper {
	position: relative;
}

.waiting {
	color: #999;
	font-style: italic;
}
</style>
