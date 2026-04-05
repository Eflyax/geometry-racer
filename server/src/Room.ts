import type { WebSocket } from 'ws';
import type {
	CarState,
	GamePhase,
	GridCell,
	Player,
	RoomConfig,
	RoomState,
	Track,
} from 'animal-racer-shared';
import { PLAYER_COLORS, TICK_MS, Physics } from 'animal-racer-shared';
import type { ClientMessage, ServerMessage } from 'animal-racer-shared';
import { PairingManager } from './PairingManager.js';
import { TrackGenerator } from './TrackGenerator.js';

interface ConnectedPlayer {
	player: Player;
	ws: WebSocket;
	touching: boolean;
}

export class Room {
	code: string;
	phase: GamePhase = 'lobby';
	hostId: string;
	config: RoomConfig = {
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
	lastActivity = Date.now();

	private players = new Map<string, ConnectedPlayer>();
	private grid: Array<GridCell> = [];
	private pairingEdges = new Map<string, Array<{ tokenId: string; color: string; side: 'top' | 'right' | 'bottom' | 'left'; neighborPlayerId: string }>>();
	private track: Track | null = null;
	private cars: Array<CarState> = [];
	private gameInterval: ReturnType<typeof setInterval> | null = null;
	private lastTickTime = 0;
	private tick = 0;
	private raceStartTime = 0;

	constructor(code: string, hostId: string, hostName: string) {
		this.code = code;
		this.hostId = hostId;
	}

	addPlayer(id: string, name: string, ws: WebSocket): boolean {
		if (this.phase !== 'lobby') return false;
		if (this.players.size >= this.config.maxPlayers) return false;

		const usedColors = new Set(
			Array.from(this.players.values()).map((p) => p.player.color)
		);
		const color = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[0];

		const player: Player = {
			id,
			name,
			color,
			lane: this.players.size,
			screen: null,
			pairingConfirmed: false,
		};

		this.players.set(id, { player, ws, touching: false });
		this.lastActivity = Date.now();
		this.broadcastRoomState();
		return true;
	}

	removePlayer(id: string): void {
		this.players.delete(id);
		this.lastActivity = Date.now();

		if (this.players.size === 0) return;

		if (id === this.hostId) {
			const first = this.players.values().next().value;
			if (first) {
				this.hostId = first.player.id;
			}
		}

		this.broadcastRoomState();
	}

	hasPlayer(id: string): boolean {
		return this.players.has(id);
	}

	get playerCount(): number {
		return this.players.size;
	}

	get isEmpty(): boolean {
		return this.players.size === 0;
	}

	handleMessage(playerId: string, msg: ClientMessage): void {
		this.lastActivity = Date.now();
		const cp = this.players.get(playerId);
		if (!cp) return;

		switch (msg.type) {
			case 'UPDATE_CONFIG':
				if (playerId === this.hostId && (this.phase === 'lobby' || this.config.devMode)) {
					Object.assign(this.config, msg.config);
					this.broadcastRoomState();
				}
				break;

			case 'SELECT_COLOR': {
				if (this.phase !== 'lobby') break;
				const usedColors = new Set(
					Array.from(this.players.values())
						.filter((p) => p.player.id !== playerId)
						.map((p) => p.player.color)
				);
				if (!usedColors.has(msg.color)) {
					cp.player.color = msg.color;
					this.broadcastRoomState();
				}
				break;
			}

			case 'SCREEN_INFO':
				cp.player.screen = msg.screen;
				if (this.phase === 'measuring' && this.allScreensReported()) {
					this.startPairing();
				}
				break;

			case 'START_GAME':
				if (playerId === this.hostId && this.phase === 'lobby') {
					this.startMeasuring();
				}
				break;

			case 'CONFIRM_PAIRING':
				cp.player.pairingConfirmed = true;
				if (this.allPairingConfirmed()) {
					this.startRacing();
				}
				break;

			case 'TOUCH_START':
				cp.touching = true;
				break;

			case 'TOUCH_END':
				cp.touching = false;
				break;

			case 'BACK_TO_LOBBY':
				if (playerId === this.hostId && this.phase === 'finished') {
					this.returnToLobby();
				}
				break;

			case 'DEV_RESTART':
				if (playerId === this.hostId && this.config.devMode) {
					this.devRestart();
				}
				break;
		}
	}

	private startMeasuring(): void {
		this.phase = 'measuring';

		for (const cp of this.players.values()) {
			cp.player.screen = null;
		}

		this.broadcast({ type: 'PHASE_CHANGE', phase: 'measuring' });
	}

	private allScreensReported(): boolean {
		for (const cp of this.players.values()) {
			if (!cp.player.screen) return false;
		}
		return true;
	}

	private startPairing(): void {
		this.phase = 'pairing';

		const playerList = Array.from(this.players.values()).map((cp) => cp.player);
		const pairing = PairingManager.assignGrid(playerList);
		this.grid = pairing.grid;

		const trackGen = new TrackGenerator();
		this.track = trackGen.generate(pairing.worldWidth, pairing.worldHeight, playerList.length, this.config.wiggliness);

		for (const cp of this.players.values()) {
			const cell = this.grid.find((c) => c.playerId === cp.player.id);
			const edges = pairing.edges.get(cp.player.id) ?? [];
			if (cell) {
				this.send(cp.ws, {
					type: 'GRID_ASSIGNED',
					yourCell: cell,
					edges,
					track: this.track,
				});
			}
		}

		this.broadcast({ type: 'PHASE_CHANGE', phase: 'pairing' });
	}

	private allPairingConfirmed(): boolean {
		for (const cp of this.players.values()) {
			if (!cp.player.pairingConfirmed) return false;
		}
		return true;
	}

	private startRacing(): void {
		this.phase = 'racing';
		this.tick = 0;
		this.raceStartTime = Date.now();

		this.cars = Array.from(this.players.values()).map((cp) => ({
			playerId: cp.player.id,
			lane: cp.player.lane,
			t: 0,
			speed: 0,
			derailed: false,
			penaltyRemaining: 0,
			derailT: 0,
			finished: false,
			finishTime: null,
		}));

		this.broadcast({ type: 'PHASE_CHANGE', phase: 'racing' });

		this.lastTickTime = performance.now();
		this.gameInterval = setInterval(() => this.gameTick(), TICK_MS);
	}

	private gameTick(): void {
		if (!this.track) return;
		this.tick++;
		const now = performance.now();
		const dt = Math.min((now - this.lastTickTime) / 1000, (TICK_MS * 3) / 1000);
		this.lastTickTime = now;

		for (const car of this.cars) {
			if (car.finished) continue;

			const cp = this.players.get(car.playerId);
			const touching = cp?.touching ?? false;

			Physics.updateCar(car, touching, dt, this.track, this.config);
		}

		this.broadcast({ type: 'GAME_STATE', cars: this.cars, tick: this.tick });

		if (this.cars.every((c) => c.finished)) {
			this.finishRace();
		}
	}

	private finishRace(): void {
		if (this.gameInterval) {
			clearInterval(this.gameInterval);
			this.gameInterval = null;
		}

		this.phase = 'finished';

		const rankings = this.cars
			.filter((c) => c.finishTime !== null)
			.sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity))
			.map((c) => ({ playerId: c.playerId, finishTime: c.finishTime! }));

		this.broadcast({ type: 'RACE_FINISHED', rankings });
		this.broadcast({ type: 'PHASE_CHANGE', phase: 'finished' });
	}

	private devRestart(): void {
		if (this.gameInterval) {
			clearInterval(this.gameInterval);
			this.gameInterval = null;
		}

		// Regenerate track
		const playerList = Array.from(this.players.values()).map((cp) => cp.player);
		const pairing = PairingManager.assignGrid(playerList);
		this.grid = pairing.grid;

		const trackGen = new TrackGenerator();
		this.track = trackGen.generate(pairing.worldWidth, pairing.worldHeight, playerList.length, this.config.wiggliness);

		// Send new grid + track to all clients
		for (const cp of this.players.values()) {
			const cell = this.grid.find((c) => c.playerId === cp.player.id);
			const edges = pairing.edges.get(cp.player.id) ?? [];
			if (cell) {
				this.send(cp.ws, {
					type: 'GRID_ASSIGNED',
					yourCell: cell,
					edges,
					track: this.track,
				});
			}
		}

		// Reset and start racing
		this.startRacing();
	}

	private returnToLobby(): void {
		if (this.gameInterval) {
			clearInterval(this.gameInterval);
			this.gameInterval = null;
		}

		this.phase = 'lobby';
		this.grid = [];
		this.track = null;
		this.cars = [];
		this.tick = 0;

		for (const cp of this.players.values()) {
			cp.player.pairingConfirmed = false;
			cp.touching = false;
		}

		this.broadcast({ type: 'PHASE_CHANGE', phase: 'lobby' });
		this.broadcastRoomState();
	}

	getState(): RoomState {
		return {
			code: this.code,
			phase: this.phase,
			hostId: this.hostId,
			config: this.config,
			players: Array.from(this.players.values()).map((cp) => cp.player),
			grid: this.grid,
			track: this.track,
			cars: this.cars,
		};
	}

	private broadcastRoomState(): void {
		this.broadcast({ type: 'ROOM_UPDATED', room: this.getState() });
	}

	private broadcast(msg: ServerMessage): void {
		const data = JSON.stringify(msg);
		for (const cp of this.players.values()) {
			if (cp.ws.readyState === 1) {
				cp.ws.send(data);
			}
		}
	}

	private send(ws: WebSocket, msg: ServerMessage): void {
		if (ws.readyState === 1) {
			ws.send(JSON.stringify(msg));
		}
	}

	destroy(): void {
		if (this.gameInterval) {
			clearInterval(this.gameInterval);
			this.gameInterval = null;
		}
	}
}
