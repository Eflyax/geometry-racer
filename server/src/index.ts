import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { SERVER_PORT } from 'animal-racer-shared';
import type { ClientMessage, ServerMessage } from 'animal-racer-shared';
import { RoomManager } from './RoomManager.js';

const server = createServer((req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*');

	if (req.url === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok' }));
		return;
	}

	res.writeHead(404);
	res.end();
});

const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();

const clientRooms = new Map<WebSocket, { roomCode: string; playerId: string }>();

let nextId = 1;

wss.on('connection', (ws) => {
	const playerId = `player-${nextId++}-${Date.now().toString(36)}`;

	ws.on('message', (raw) => {
		let msg: ClientMessage;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			send(ws, { type: 'ERROR', code: 'INVALID_MESSAGE', message: 'Invalid JSON' });
			return;
		}

		switch (msg.type) {
			case 'CREATE_ROOM': {
				const room = roomManager.createRoom(playerId, msg.playerName);
				room.addPlayer(playerId, msg.playerName, ws);
				clientRooms.set(ws, { roomCode: room.code, playerId });
				send(ws, { type: 'ROOM_JOINED', room: room.getState(), yourPlayerId: playerId });
				break;
			}

			case 'JOIN_ROOM': {
				const room = roomManager.getRoom(msg.code);
				if (!room) {
					send(ws, { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'Room not found' });
					return;
				}
				if (!room.addPlayer(playerId, msg.playerName, ws)) {
					send(ws, { type: 'ERROR', code: 'CANNOT_JOIN', message: 'Cannot join room' });
					return;
				}
				clientRooms.set(ws, { roomCode: room.code, playerId });
				send(ws, { type: 'ROOM_JOINED', room: room.getState(), yourPlayerId: playerId });
				break;
			}

			default: {
				const client = clientRooms.get(ws);
				if (!client) {
					send(ws, { type: 'ERROR', code: 'NOT_IN_ROOM', message: 'Not in a room' });
					return;
				}
				const room = roomManager.getRoom(client.roomCode);
				if (!room) {
					send(ws, { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'Room not found' });
					return;
				}
				room.handleMessage(client.playerId, msg);
			}
		}
	});

	ws.on('close', () => {
		const client = clientRooms.get(ws);
		if (client) {
			const room = roomManager.getRoom(client.roomCode);
			if (room) {
				room.removePlayer(client.playerId);
				if (room.isEmpty) {
					roomManager.removeRoom(client.roomCode);
				}
			}
			clientRooms.delete(ws);
		}
	});
});

function send(ws: WebSocket, msg: ServerMessage): void {
	if (ws.readyState === 1) {
		ws.send(JSON.stringify(msg));
	}
}

server.on('error', (err: NodeJS.ErrnoException) => {
	if (err.code === 'EADDRINUSE') {
		console.error(`Port ${SERVER_PORT} is already in use. Kill the existing process or change SERVER_PORT.`);
		process.exit(1);
	}
	throw err;
});

server.listen(SERVER_PORT, () => {
	console.log(`Server running on http://localhost:${SERVER_PORT}`);
});
