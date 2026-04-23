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
