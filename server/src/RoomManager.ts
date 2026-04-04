import { ROOM_CODE_LENGTH, ROOM_EXPIRY_MS } from 'animal-racer-shared';
import type { RoomConfig } from 'animal-racer-shared';
import { Room } from './Room.js';

export class RoomManager {
	private rooms = new Map<string, Room>();
	private cleanupInterval: ReturnType<typeof setInterval>;

	constructor() {
		this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
	}

	createRoom(hostId: string, hostName: string): Room {
		const code = this.generateCode();
		const room = new Room(code, hostId, hostName);
		this.rooms.set(code, room);
		return room;
	}

	getRoom(code: string): Room | undefined {
		return this.rooms.get(code.toUpperCase());
	}

	removeRoom(code: string): void {
		const room = this.rooms.get(code);
		if (room) {
			room.destroy();
			this.rooms.delete(code);
		}
	}

	private generateCode(): string {
		const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
		let code: string;
		do {
			code = '';
			for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
				code += chars[Math.floor(Math.random() * chars.length)];
			}
		} while (this.rooms.has(code));
		return code;
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [code, room] of this.rooms) {
			if (now - room.lastActivity > ROOM_EXPIRY_MS) {
				room.destroy();
				this.rooms.delete(code);
			}
		}
	}

	destroy(): void {
		clearInterval(this.cleanupInterval);
		for (const room of this.rooms.values()) {
			room.destroy();
		}
		this.rooms.clear();
	}
}
