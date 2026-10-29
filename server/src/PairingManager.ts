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
	safeWidth: number;
	safeHeight: number;
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

		const { safeWidth, safeHeight } = this.computeSafeRect(
			rawCells, cols, rows, colWidths, rowHeights, colOffsets, rowOffsets
		);

		return { grid, edges, worldWidth, worldHeight, safeWidth, safeHeight };
	}

	/**
	 * Largest axis-aligned rectangle anchored at the world origin (0, 0) that is
	 * fully covered by paired device screens. The track is generated inside this
	 * rectangle so it can never land in a region no device displays — e.g. the
	 * trailing empty cells of an incomplete last row (3, 5, 6, 7… players) or the
	 * gaps left when devices in the same column/row have different pixel sizes.
	 *
	 * Coverage proof: the screens tile left-to-right / top-to-bottom from the
	 * origin, with the only holes being (a) right/bottom slivers where a device is
	 * smaller than its column/row slot and (b) trailing cells of the last row. For
	 * a candidate rectangle [0,W]×[0,H] we require that every row whose band starts
	 * before H covers x contiguously up to W, and every column whose band starts
	 * before W covers y contiguously up to H. Those two conditions guarantee every
	 * point of the rectangle lies inside some device. We pick the covered candidate
	 * of maximum area.
	 */
	private static computeSafeRect(
		rawCells: Array<{ playerId: string; col: number; row: number; sw: number; sh: number }>,
		cols: number,
		rows: number,
		colWidths: Array<number>,
		rowHeights: Array<number>,
		colOffsets: Array<number>,
		rowOffsets: Array<number>
	): { safeWidth: number; safeHeight: number } {
		const cellAt = (col: number, row: number): { sw: number; sh: number } | undefined =>
			rawCells.find((c) => c.col === col && c.row === row);

		// Contiguous covered width of a row, scanning columns from x=0 and stopping
		// at the first hole (missing cell or a device narrower than its column).
		const rowRightExtent = (row: number): number => {
			let x = 0;
			for (let col = 0; col < cols; col++) {
				const cell = cellAt(col, row);
				if (!cell) break;
				x = colOffsets[col] + cell.sw;
				if (cell.sw < colWidths[col]) break;
			}
			return x;
		};

		// Contiguous covered height of a column, scanning rows from y=0.
		const colBottomExtent = (col: number): number => {
			let y = 0;
			for (let row = 0; row < rows; row++) {
				const cell = cellAt(col, row);
				if (!cell) break;
				y = rowOffsets[row] + cell.sh;
				if (cell.sh < rowHeights[row]) break;
			}
			return y;
		};

		const rowRights: Array<number> = [];
		for (let row = 0; row < rows; row++) {
			rowRights.push(rowRightExtent(row));
		}
		const colBottoms: Array<number> = [];
		for (let col = 0; col < cols; col++) {
			colBottoms.push(colBottomExtent(col));
		}

		const wCandidates = Array.from(new Set(rowRights));
		const hCandidates = Array.from(new Set(colBottoms));

		let safeWidth = 0;
		let safeHeight = 0;
		let bestArea = 0;

		for (const w of wCandidates) {
			for (const h of hCandidates) {
				let covered = true;
				for (let row = 0; row < rows && covered; row++) {
					if (rowOffsets[row] < h && rowRights[row] < w) covered = false;
				}
				for (let col = 0; col < cols && covered; col++) {
					if (colOffsets[col] < w && colBottoms[col] < h) covered = false;
				}
				if (covered && w * h > bestArea) {
					bestArea = w * h;
					safeWidth = w;
					safeHeight = h;
				}
			}
		}

		return { safeWidth, safeHeight };
	}
}
