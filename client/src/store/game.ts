import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
	CarState,
	GamePhase,
	GridCell,
	PairingEdge,
	Player,
	RoomConfig,
	RoomState,
	Track,
} from 'animal-racer-shared';
import type { ServerMessage } from 'animal-racer-shared';
import { Physics } from 'animal-racer-shared';
import { Connection } from '@/ws/Connection';

export const useGameStore = defineStore('game', () => {
	const connection = ref<Connection | null>(null);
	const myPlayerId = ref('');
	const roomCode = ref('');
	const phase = ref<GamePhase>('lobby');
	const hostId = ref('');
	const config = ref<RoomConfig>({
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
	});
	const players = ref<Array<Player>>([]);
	const myCell = ref<GridCell | null>(null);
	const pairingEdges = ref<Array<PairingEdge>>([]);
	const track = ref<Track | null>(null);
	const cars = ref<Array<CarState>>([]);
	const rankings = ref<Array<{ playerId: string; finishTime: number }>>([]);

	// Prediction state
	const predictedCar = ref<CarState | null>(null);
	const isTouching = ref(false);
	const snapshots = ref<Array<{ tick: number; timestamp: number; cars: Array<CarState> }>>([]);
	const renderTimestamp = ref(0);

	const isHost = computed(() => myPlayerId.value === hostId.value);
	const myPlayer = computed(() => players.value.find((p) => p.id === myPlayerId.value));
	const myCar = computed(() => cars.value.find((c) => c.playerId === myPlayerId.value));

	function getWsUrl(): string {
		if (import.meta.env.VITE_WS_URL) {
			return import.meta.env.VITE_WS_URL;
		}
		const host = import.meta.env.VITE_SERVER_HOST || 'localhost';
		const port = import.meta.env.VITE_SERVER_PORT || '3000';
		return `ws://${host}:${port}`;
	}

	async function connect(): Promise<void> {
		const conn = new Connection(getWsUrl());
		await conn.connect();
		connection.value = conn;

		conn.onMessage((msg: ServerMessage) => {
			handleMessage(msg);
		});
	}

	let joinResolve: (() => void) | null = null;
	let joinReject: ((err: Error) => void) | null = null;

	function handleMessage(msg: ServerMessage): void {
		switch (msg.type) {
			case 'ROOM_JOINED':
				myPlayerId.value = msg.yourPlayerId;
				applyRoomState(msg.room);
				joinResolve?.();
				joinResolve = null;
				joinReject = null;
				break;

			case 'ROOM_UPDATED':
				applyRoomState(msg.room);
				break;

			case 'PHASE_CHANGE':
				phase.value = msg.phase;
				if (msg.phase === 'racing') {
					predictedCar.value = null;
					snapshots.value = [];
				}
				break;

			case 'GRID_ASSIGNED':
				myCell.value = msg.yourCell;
				pairingEdges.value = msg.edges;
				track.value = msg.track;
				break;

			case 'GAME_STATE': {
				const now = performance.now();
				snapshots.value = [...snapshots.value.slice(-7), { tick: msg.tick, timestamp: now, cars: msg.cars }];
				cars.value = msg.cars;
				reconcileOwnCar(msg.cars);
				break;
			}

			case 'RACE_FINISHED':
				rankings.value = msg.rankings;
				break;

			case 'ERROR':
				console.error(`Server error [${msg.code}]: ${msg.message}`);
				joinReject?.(new Error(msg.message));
				joinResolve = null;
				joinReject = null;
				break;
		}
	}

	function reconcileOwnCar(serverCars: Array<CarState>): void {
		const serverCar = serverCars.find((c) => c.playerId === myPlayerId.value);
		if (!serverCar) return;

		if (!predictedCar.value) {
			predictedCar.value = { ...serverCar };
			return;
		}

		const derailMismatch =
			predictedCar.value.derailed !== serverCar.derailed ||
			predictedCar.value.finished !== serverCar.finished;
		const tDrift = Math.abs(predictedCar.value.t - serverCar.t);

		if (derailMismatch || tDrift > 0.05) {
			predictedCar.value = { ...serverCar };
		}
	}

	function renderCarsAt(nowMs: number): Record<string, CarState> {
		const renderTime = nowMs - 100;
		const snaps = snapshots.value;

		if (snaps.length < 2) {
			return Object.fromEntries((snaps[snaps.length - 1]?.cars ?? []).map((c) => [c.playerId, c]));
		}

		let before = snaps[0];
		let after = snaps[1];
		for (let i = 1; i < snaps.length; i++) {
			if (snaps[i].timestamp <= renderTime) {
				before = snaps[i];
				after = snaps[Math.min(i + 1, snaps.length - 1)];
			}
		}

		const span = after.timestamp - before.timestamp;
		const alpha = span < 1 ? 1 : Math.min((renderTime - before.timestamp) / span, 1);

		const result: Record<string, CarState> = {};
		for (const aCar of after.cars) {
			const bCar = before.cars.find((c) => c.playerId === aCar.playerId);
			if (!bCar || aCar.derailed || bCar.derailed) {
				result[aCar.playerId] = aCar;
				continue;
			}
			result[aCar.playerId] = {
				...aCar,
				t: bCar.t + (aCar.t - bCar.t) * alpha,
				speed: bCar.speed + (aCar.speed - bCar.speed) * alpha,
			};
		}
		return result;
	}

	let rafHandle = 0;
	let lastRafTime = 0;

	function startRafLoop(): void {
		if (rafHandle) return;
		lastRafTime = performance.now();

		function frame(now: number): void {
			const dt = Math.min((now - lastRafTime) / 1000, 0.05);
			lastRafTime = now;

			if (phase.value === 'racing' && track.value && predictedCar.value && !predictedCar.value.finished) {
				Physics.updateCar(predictedCar.value, isTouching.value, dt, track.value, config.value);
			}

			renderTimestamp.value = now;
			rafHandle = requestAnimationFrame(frame);
		}

		rafHandle = requestAnimationFrame(frame);
	}

	function stopRafLoop(): void {
		if (rafHandle) {
			cancelAnimationFrame(rafHandle);
			rafHandle = 0;
		}
	}

	function applyRoomState(room: RoomState): void {
		roomCode.value = room.code;
		phase.value = room.phase;
		hostId.value = room.hostId;
		config.value = room.config;
		players.value = room.players;
		if (room.track) track.value = room.track;
		if (room.cars.length) cars.value = room.cars;
	}

	function send(msg: Parameters<Connection['send']>[0]): void {
		connection.value?.send(msg);
	}

	function createRoom(playerName: string): Promise<void> {
		return new Promise((resolve, reject) => {
			joinResolve = resolve;
			joinReject = reject;
			send({ type: 'CREATE_ROOM', playerName });
		});
	}

	function joinRoom(code: string, playerName: string): Promise<void> {
		return new Promise((resolve, reject) => {
			joinResolve = resolve;
			joinReject = reject;
			send({ type: 'JOIN_ROOM', code, playerName });
		});
	}

	function selectColor(color: string): void {
		send({ type: 'SELECT_COLOR', color });
	}

	function updateConfig(cfg: Partial<RoomConfig>): void {
		send({ type: 'UPDATE_CONFIG', config: cfg });
	}

	function startGame(): void {
		send({ type: 'START_GAME' });
	}

	function confirmPairing(): void {
		send({ type: 'CONFIRM_PAIRING' });
	}

	function touchStart(): void {
		isTouching.value = true;
		send({ type: 'TOUCH_START' });
	}

	function touchEnd(): void {
		isTouching.value = false;
		send({ type: 'TOUCH_END' });
	}

	function backToLobby(): void {
		send({ type: 'BACK_TO_LOBBY' });
	}

	function devRestart(): void {
		send({ type: 'DEV_RESTART' });
	}

	function sendScreenInfo(): void {
		send({
			type: 'SCREEN_INFO',
			screen: {
				width: window.innerWidth,
				height: window.innerHeight,
				devicePixelRatio: window.devicePixelRatio,
			},
		});
	}

	function disconnect(): void {
		connection.value?.disconnect();
		connection.value = null;
	}

	return {
		myPlayerId,
		roomCode,
		phase,
		hostId,
		config,
		players,
		myCell,
		pairingEdges,
		track,
		cars,
		rankings,
		predictedCar,
		renderTimestamp,
		isHost,
		myPlayer,
		myCar,
		connect,
		createRoom,
		joinRoom,
		selectColor,
		updateConfig,
		startGame,
		confirmPairing,
		touchStart,
		touchEnd,
		backToLobby,
		devRestart,
		sendScreenInfo,
		disconnect,
		startRafLoop,
		stopRafLoop,
		renderCarsAt,
	};
});
