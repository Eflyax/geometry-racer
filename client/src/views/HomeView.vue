<template>
	<div class="home">
		<h1>Animal Racer</h1>

		<div class="form">
			<input
				v-model="playerName"
				placeholder="Tvoje jméno"
				maxlength="20"
				class="input"
			/>

			<div class="btn-wrapper" :title="!playerName.trim() ? 'Zadej své jméno' : ''">
				<button class="btn btn-primary" @click="handleCreate" :disabled="!playerName.trim()">
					Vytvořit místnost
				</button>
			</div>

			<div class="divider">nebo</div>

			<input
				v-model="joinCode"
				placeholder="Kód místnosti"
				maxlength="4"
				class="input input-code"
				@input="joinCode = joinCode.toUpperCase()"
			/>

			<div class="btn-wrapper" :title="joinTooltip">
				<button class="btn btn-secondary" @click="handleJoin" :disabled="!!joinTooltip">
					Připojit se
				</button>
			</div>
		</div>

		<p v-if="error" class="error">{{ error }}</p>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useGameStore } from '@/store/game';

const router = useRouter();
const route = useRoute();
const store = useGameStore();

const playerName = ref('');
const joinCode = ref('');
const error = ref('');

const joinTooltip = computed(() => {
	if (!playerName.value.trim() && joinCode.value.length !== 4) return 'Zadej jméno a 4-místný kód';
	if (!playerName.value.trim()) return 'Zadej své jméno';
	if (joinCode.value.length !== 4) return 'Zadej 4-místný kód místnosti';
	return '';
});

onMounted(() => {
	const code = route.params.code;
	if (typeof code === 'string' && code.length === 4) {
		joinCode.value = code.toUpperCase();
	}
});

async function handleCreate(): Promise<void> {
	try {
		await store.connect();
		await store.createRoom(playerName.value.trim());
		store.sendScreenInfo();
		router.push('/lobby');
	} catch {
		error.value = 'Nepodařilo se připojit k serveru';
	}
}

async function handleJoin(): Promise<void> {
	try {
		await store.connect();
		await store.joinRoom(joinCode.value, playerName.value.trim());
		store.sendScreenInfo();
		router.push('/lobby');
	} catch {
		error.value = 'Nepodařilo se připojit k serveru';
	}
}
</script>

<style scoped>
.home {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100%;
	padding: 20px;
}

h1 {
	font-size: 2.5rem;
	margin-bottom: 2rem;
	background: linear-gradient(135deg, #FF6B35, #E91E63);
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
}

.form {
	display: flex;
	flex-direction: column;
	gap: 12px;
	width: 100%;
	max-width: 320px;
}

.input {
	padding: 12px 16px;
	border: 2px solid #333;
	border-radius: 8px;
	background: #16213e;
	color: #eee;
	font-size: 1rem;
	outline: none;
	text-align: center;
}

.input:focus {
	border-color: #FF6B35;
}

.input-code {
	font-size: 1.5rem;
	letter-spacing: 0.5em;
	text-transform: uppercase;
}

.btn-wrapper {
	position: relative;
}

.btn {
	width: 100%;
	padding: 14px;
	border: none;
	border-radius: 8px;
	font-size: 1rem;
	font-weight: 600;
	cursor: pointer;
	transition: opacity 0.2s;
}

.btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
	pointer-events: none;
}

.btn-primary {
	background: linear-gradient(135deg, #FF6B35, #E91E63);
	color: white;
}

.btn-secondary {
	background: #333;
	color: #eee;
}

.divider {
	text-align: center;
	color: #666;
	font-size: 0.9rem;
}

.error {
	color: #f44336;
	margin-top: 1rem;
}
</style>
