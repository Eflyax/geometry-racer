<template>
	<div class="pairing">
		<div v-if="!store.myCell" class="measuring">
			<p>Měření obrazovky...</p>
		</div>

		<div v-else class="pairing-screen">
			<div
				v-for="edge in store.pairingEdges"
				:key="edge.tokenId"
				class="half-circle"
				:class="edge.side"
				:style="{ background: edge.color }"
			></div>

			<div class="center-content">
				<p>Přilož telefon podle barev</p>
				<button
					v-if="!confirmed"
					class="btn btn-confirm"
					@click="confirm"
				>
					Potvrzuji pozici
				</button>
				<p v-else class="confirmed-text">Potvrzeno! Čekám na ostatní...</p>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '@/store/game';

const store = useGameStore();
const router = useRouter();
const confirmed = ref(false);

function confirm(): void {
	confirmed.value = true;
	store.confirmPairing();
}

watch(() => store.phase, (phase) => {
	if (phase === 'racing') {
		router.push('/race');
	} else if (phase === 'lobby') {
		router.push('/lobby');
	}
});
</script>

<style scoped>
.pairing {
	width: 100%;
	height: 100%;
	position: relative;
}

.measuring {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
	font-size: 1.2rem;
	color: #999;
}

.pairing-screen {
	width: 100%;
	height: 100%;
	position: relative;
	background: #0f0f23;
}

.half-circle {
	position: absolute;
	width: 60px;
	height: 60px;
	border-radius: 50%;
}

.half-circle.top {
	top: -30px;
	left: 50%;
	transform: translateX(-50%);
}

.half-circle.bottom {
	bottom: -30px;
	left: 50%;
	transform: translateX(-50%);
}

.half-circle.left {
	left: -30px;
	top: 50%;
	transform: translateY(-50%);
}

.half-circle.right {
	right: -30px;
	top: 50%;
	transform: translateY(-50%);
}

.center-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100%;
	gap: 1rem;
}

.btn-confirm {
	padding: 14px 40px;
	border: none;
	border-radius: 8px;
	font-size: 1.1rem;
	font-weight: 600;
	cursor: pointer;
	background: linear-gradient(135deg, #4CAF50, #009688);
	color: white;
}

.confirmed-text {
	color: #4CAF50;
}
</style>
