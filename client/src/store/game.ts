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
import { SERVER_PORT } from 'animal-racer-shared';
import type { ServerMessage } from 'animal-racer-shared';
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
	});
	const players = ref<Array<Player>>([]);
	const myCell = ref<GridCell | null>(null);
	const pairingEdges = ref<Array<PairingEdge>>([]);
	const track = ref<Track | null>(null);
	const cars = ref<Array<CarState>>([]);
	const rankings = ref<Array<{ playerId: string; finishTime: number }>>([]);

	const isHost = computed(() => myPlayerId.value === hostId.value);
	const myPlayer = computed(() => players.value.find((p) => p.id === myPlayerId.value));
	const myCar = computed(() => cars.value.find((c) => c.playerId === myPlayerId.value));

	function getWsUrl(): string {
		const host = window.location.hostname || 'localhost';
		return `ws://${host}:${SERVER_PORT}`;
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
				break;

			case 'GRID_ASSIGNED':
				myCell.value = msg.yourCell;
				pairingEdges.value = msg.edges;
				track.value = msg.track;
				break;

			case 'GAME_STATE':
				cars.value = msg.cars;
				break;

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
		send({ type: 'TOUCH_START' });
	}

	function touchEnd(): void {
		send({ type: 'TOUCH_END' });
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
		sendScreenInfo,
		disconnect,
	};
});
