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

		const defaultWidth = 375;
		const defaultHeight = 667;

		// Build grid cells with actual screen dimensions
		const rawCells: Array<{ playerId: string; col: number; row: number; sw: number; sh: number }> = [];
		let idx = 0;
		for (let row = 0; row < rows && idx < n; row++) {
			for (let col = 0; col < cols && idx < n; col++) {
				const player = players[idx];
				rawCells.push({
					playerId: player.id,
					col,
					row,
					sw: player.screen?.width ?? defaultWidth,
					sh: player.screen?.height ?? defaultHeight,
				});
				idx++;
			}
		}

		// Per-column max width and per-row max height for seamless tiling
		const colWidths = Array<number>(cols).fill(0);
		const rowHeights = Array<number>(rows).fill(0);
		for (const c of rawCells) {
			colWidths[c.col] = Math.max(colWidths[c.col], c.sw);
			rowHeights[c.row] = Math.max(rowHeights[c.row], c.sh);
		}

		// Prefix sums → world offsets
		const colOffsets = Array<number>(cols).fill(0);
		for (let c = 1; c < cols; c++) colOffsets[c] = colOffsets[c - 1] + colWidths[c - 1];
		const rowOffsets = Array<number>(rows).fill(0);
		for (let r = 1; r < rows; r++) rowOffsets[r] = rowOffsets[r - 1] + rowHeights[r - 1];

		const grid: Array<GridCell> = [];
		const edges = new Map<string, Array<PairingEdge>>();

		for (const c of rawCells) {
			grid.push({
				playerId: c.playerId,
				gridX: c.col,
				gridY: c.row,
				worldOffsetX: colOffsets[c.col],
				worldOffsetY: rowOffsets[c.row],
				screenWidth: c.sw,
				screenHeight: c.sh,
			});
			edges.set(c.playerId, []);
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

		const worldWidth = colOffsets[cols - 1] + colWidths[cols - 1];
		const worldHeight = rowOffsets[rows - 1] + rowHeights[rows - 1];

		return { grid, edges, worldWidth, worldHeight };
	}
}
