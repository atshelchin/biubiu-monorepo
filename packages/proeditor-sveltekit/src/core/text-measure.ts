/**
 * Text Measurer - Canvas API with LRU Cache
 *
 * Core design:
 * - Uses Canvas 2D API for accurate text width measurement
 * - LRU cache to avoid redundant measurements
 * - Critical for cursor positioning accuracy
 */

export interface TextMeasurer {
	/** Measure text width in pixels */
	measureText(text: string): number;
	/** Find column from pixel position */
	colFromPixel(text: string, x: number): number;
	/** Get pixel position of column */
	pixelFromCol(text: string, col: number): number;
	/** Update font settings */
	setFont(fontFamily: string, fontSize: number): void;
	/** Clear measurement cache */
	clearCache(): void;
}

export interface TextMeasurerOptions {
	fontFamily?: string;
	fontSize?: number;
	cacheSize?: number;
}

export function createTextMeasurer(options: TextMeasurerOptions = {}): TextMeasurer {
	const {
		fontFamily = "'JetBrains Mono', monospace",
		fontSize = 13,
		cacheSize = 1000
	} = options;

	let currentFont = `${fontSize}px ${fontFamily}`;
	let ctx: CanvasRenderingContext2D | null = null;

	// LRU cache: key = text, value = width
	const cache = new Map<string, number>();
	const cacheKeys: string[] = [];

	function getContext(): CanvasRenderingContext2D {
		if (!ctx) {
			const canvas = document.createElement('canvas');
			ctx = canvas.getContext('2d')!;
			ctx.font = currentFont;
		}
		return ctx;
	}

	function measureText(text: string): number {
		const cached = cache.get(text);
		if (cached !== undefined) return cached;

		const context = getContext();
		const width = context.measureText(text).width;

		// LRU eviction
		if (cache.size >= cacheSize) {
			const oldKey = cacheKeys.shift();
			if (oldKey) cache.delete(oldKey);
		}

		cache.set(text, width);
		cacheKeys.push(text);

		return width;
	}

	function colFromPixel(text: string, x: number): number {
		if (x <= 0) return 0;
		if (text.length === 0) return 0;

		const fullWidth = measureText(text);
		if (x >= fullWidth) return text.length;

		// Binary search for closest column
		let low = 0;
		let high = text.length;

		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			const width = measureText(text.substring(0, mid));

			if (width < x) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}

		// Check if previous column is closer
		if (low > 0) {
			const prevWidth = measureText(text.substring(0, low - 1));
			const currWidth = measureText(text.substring(0, low));
			if (x - prevWidth < currWidth - x) {
				return low - 1;
			}
		}

		return low;
	}

	function pixelFromCol(text: string, col: number): number {
		if (col <= 0) return 0;
		if (col >= text.length) return measureText(text);
		return measureText(text.substring(0, col));
	}

	function setFont(newFontFamily: string, newFontSize: number): void {
		currentFont = `${newFontSize}px ${newFontFamily}`;
		if (ctx) {
			ctx.font = currentFont;
		}
		clearCache();
	}

	function clearCache(): void {
		cache.clear();
		cacheKeys.length = 0;
	}

	return {
		measureText,
		colFromPixel,
		pixelFromCol,
		setFont,
		clearCache
	};
}
