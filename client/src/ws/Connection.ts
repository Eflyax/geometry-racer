import type { ClientMessage, ServerMessage } from 'animal-racer-shared';

type MessageHandler = (msg: ServerMessage) => void;

export class Connection {
	private ws: WebSocket | null = null;
	private handlers = new Set<MessageHandler>();
	private url: string;

	constructor(url: string) {
		this.url = url;
	}

	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.ws = new WebSocket(this.url);

			this.ws.onopen = () => resolve();
			this.ws.onerror = () => reject(new Error('WebSocket connection failed'));

			this.ws.onmessage = (event) => {
				try {
					const msg: ServerMessage = JSON.parse(event.data);
					for (const handler of this.handlers) {
						handler(msg);
					}
				} catch {
					console.error('Failed to parse server message');
				}
			};

			this.ws.onclose = () => {
				console.log('WebSocket disconnected');
			};
		});
	}

	send(msg: ClientMessage): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	onMessage(handler: MessageHandler): () => void {
		this.handlers.add(handler);
		return () => this.handlers.delete(handler);
	}

	disconnect(): void {
		this.ws?.close();
		this.ws = null;
	}

	get connected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}
}
