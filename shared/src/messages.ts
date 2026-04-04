import type {
	CarState,
	GridCell,
	PairingEdge,
	RoomConfig,
	RoomState,
	ScreenInfo,
} from './types.js';

export type ClientMessage =
	| { type: 'CREATE_ROOM'; playerName: string }
	| { type: 'JOIN_ROOM'; code: string; playerName: string }
	| { type: 'UPDATE_CONFIG'; config: Partial<RoomConfig> }
	| { type: 'SCREEN_INFO'; screen: ScreenInfo }
	| { type: 'SELECT_COLOR'; color: string }
	| { type: 'START_GAME' }
	| { type: 'CONFIRM_PAIRING' }
	| { type: 'TOUCH_START' }
	| { type: 'TOUCH_END' }
	| { type: 'REQUEST_QR' }
	| { type: 'BACK_TO_LOBBY' }
	| { type: 'DEV_RESTART' };

export type ServerMessage =
	| { type: 'ROOM_JOINED'; room: RoomState; yourPlayerId: string }
	| { type: 'ROOM_UPDATED'; room: RoomState }
	| { type: 'PHASE_CHANGE'; phase: RoomState['phase'] }
	| { type: 'GRID_ASSIGNED'; yourCell: GridCell; edges: Array<PairingEdge>; track: RoomState['track'] }
	| { type: 'GAME_STATE'; cars: Array<CarState>; tick: number }
	| { type: 'RACE_FINISHED'; rankings: Array<{ playerId: string; finishTime: number }> }
	| { type: 'JOIN_URL'; url: string }
	| { type: 'ERROR'; code: string; message: string };
