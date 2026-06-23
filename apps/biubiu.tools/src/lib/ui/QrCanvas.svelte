<script lang="ts">
	import { encode as encodeQr } from 'uqr';

	interface Props {
		value: string;
		size?: number;
	}
	let { value, size = 200 }: Props = $props();

	function render(canvas: HTMLCanvasElement, text: string) {
		const result = encodeQr(text, { ecc: 'M', border: 2 });
		const n = result.size;
		const data = result.data as boolean[][];
		const scale = Math.max(1, Math.floor(size / n));
		const px = n * scale;
		canvas.width = px;
		canvas.height = px;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, px, px);
		ctx.fillStyle = '#000000';
		for (let y = 0; y < n; y++) {
			for (let x = 0; x < n; x++) {
				if (data[y][x]) ctx.fillRect(x * scale, y * scale, scale, scale);
			}
		}
	}

	function qr(canvas: HTMLCanvasElement, text: string) {
		render(canvas, text);
		return {
			update(next: string) {
				render(canvas, next);
			},
		};
	}
</script>

<canvas class="qr" use:qr={value}></canvas>

<style>
	.qr {
		width: 180px;
		height: 180px;
		border-radius: var(--radius-md);
		image-rendering: pixelated;
	}
</style>
