import type { GridCell, Player } from 'animal-racer-shared';

interface PairingEdge {
	tokenId: string;
	color: string;
	side: 'top' | 'right' | 'bottom' | 'left';
	neighborPlayerId: string;
}

interface PairingResult {
	grid: Array<GridCell>;
	edges: Map<string, Array<PairingEdge>>;
	worldWidth: number;
	worldHeight: number;
}

const EDGE_COLORS = [
	'#FF6B35', '#E91E63', '#9C27B0', '#3F51B5',
	'#03A9F4', '#009688', '#4CAF50', '#FFEB3B',
	'#FF9800', '#795548', '#607D8B', '#F44336',
];

function oppositeSide(side: PairingEdge['side']): PairingEdge['side'] {
	switch (side) {
		case 'top': return 'bottom';
		case 'bottom': return 'top';
		case 'left': return 'right';
		case 'right': return 'left';
	}
}

export class PairingManager {
	static assignGrid(players: Array<Player>): PairingResult {
		const n = players.length;
		const cols = Math.ceil(Math.sqrt(n));
		const rows = Math.ceil(n / cols);

		const avgWidth = players.reduce((s, p) => s + (p.screen?.width ?? 375), 0) / n;
		const avgHeight = players.reduce((s, p) => s + (p.screen?.height ?? 667), 0) / n;

		const grid: Array<GridCell> = [];
		const edges = new Map<string, Array<PairingEdge>>();

		let idx = 0;
		for (let row = 0; row < rows && idx < n; row++) {
			for (let col = 0; col < cols && idx < n; col++) {
				const player = players[idx];
				const sw = player.screen?.width ?? avgWidth;
				const sh = player.screen?.height ?? avgHeight;

				grid.push({
					playerId: player.id,
					gridX: col,
					gridY: row,
					worldOffsetX: col * avgWidth,
					worldOffsetY: row * avgHeight,
					screenWidth: sw,
					screenHeight: sh,
				});
				edges.set(player.id, []);
				idx++;
			}
		}

		let colorIdx = 0;
		const tokenCounter = { value: 0 };

		for (const cell of grid) {
			const right = grid.find((c) => c.gridX === cell.gridX + 1 && c.gridY === cell.gridY);
			if (right) {
				const tokenId = `edge-${tokenCounter.value++}`;
				const color = EDGE_COLORS[colorIdx++ % EDGE_COLORS.length];
				edges.get(cell.playerId)!.push({ tokenId, color, side: 'right', neighborPlayerId: right.playerId });
				edges.get(right.playerId)!.push({ tokenId, color, side: 'left', neighborPlayerId: cell.playerId });
			}

			const below = grid.find((c) => c.gridX === cell.gridX && c.gridY === cell.gridY + 1);
			if (below) {
				const tokenId = `edge-${tokenCounter.value++}`;
				const color = EDGE_COLORS[colorIdx++ % EDGE_COLORS.length];
				edges.get(cell.playerId)!.push({ tokenId, color, side: 'bottom', neighborPlayerId: below.playerId });
				edges.get(below.playerId)!.push({ tokenId, color, side: 'top', neighborPlayerId: cell.playerId });
			}
		}

		return {
			grid,
			edges,
			worldWidth: cols * avgWidth,
			worldHeight: rows * avgHeight,
		};
	}
}
