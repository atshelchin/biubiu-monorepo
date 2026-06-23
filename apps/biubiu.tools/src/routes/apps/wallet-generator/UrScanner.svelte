<script lang="ts">
	/**
	 * Animated-UR scanner. Opens the camera and feeds every detected QR frame to a
	 * bc-ur URDecoder until the fountain-coded UR reassembles, then returns it.
	 * Uses the native BarcodeDetector (same as the app's ScanQrButton).
	 */
	import { onDestroy } from 'svelte';
	import { createUrDecoder } from '$lib/pda-apps/wallet-generator/crypto/sign';

	interface ScannedUr {
		type: string;
		cbor: Buffer;
	}

	interface Props {
		onComplete: (ur: ScannedUr) => void;
		onCancel: () => void;
	}

	let { onComplete, onCancel }: Props = $props();

	let scanning = $state(false);
	let progress = $state(0);
	let error = $state('');
	let videoRef = $state<HTMLVideoElement | null>(null);
	let stream: MediaStream | null = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let decoder: any = null;
	let done = false;

	const supported = typeof (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector !== 'undefined';

	export async function start() {
		error = '';
		progress = 0;
		done = false;
		scanning = true;
		try {
			decoder = await createUrDecoder();
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment', width: { ideal: 720 }, height: { ideal: 720 } },
			});
			await new Promise((r) => requestAnimationFrame(r));
			if (videoRef) {
				videoRef.srcObject = stream;
				await videoRef.play();
				detectLoop();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Camera access denied';
			stop();
		}
	}

	function stop() {
		scanning = false;
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
		}
	}

	function cancel() {
		stop();
		onCancel();
	}

	function detectLoop() {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const Detector = (globalThis as any).BarcodeDetector;
		const detector = new Detector({ formats: ['qr_code'] });
		const tick = async () => {
			if (!scanning || !videoRef || done) return;
			try {
				const codes = await detector.detect(videoRef);
				for (const code of codes) {
					if (done) break;
					const value: string = code.rawValue;
					if (!value) continue;
					try {
						decoder.receivePart(value);
						progress = Math.floor(decoder.getProgress() * 100);
						if (decoder.isComplete()) {
							done = true;
							const ur = decoder.resultUR() as ScannedUr;
							stop();
							onComplete(ur);
							return;
						}
					} catch {
						// Non-UR / out-of-set frame — ignore and keep scanning.
					}
				}
			} catch {
				// Frame not ready.
			}
			if (scanning && !done) requestAnimationFrame(tick);
		};
		tick();
	}

	onDestroy(stop);
</script>

{#if scanning}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="scan-overlay" role="presentation" onclick={cancel}>
		<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
		<div class="scan-modal" onclick={(e) => e.stopPropagation()}>
			<div class="scan-header">
				<span class="scan-title">{progress}%</span>
				<button class="scan-close" onclick={cancel} aria-label="Close">✕</button>
			</div>
			<div class="scan-video-wrap">
				<!-- svelte-ignore element_invalid_self_closing_tag -->
				<video bind:this={videoRef} class="scan-video" playsinline muted></video>
				<div class="scan-frame"></div>
			</div>
			{#if error}<div class="scan-error">{error}</div>{/if}
		</div>
	</div>
{/if}

{#if !supported}
	<div class="scan-error">BarcodeDetector not supported in this browser.</div>
{/if}

<style>
	.scan-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
		backdrop-filter: blur(4px);
	}
	.scan-modal {
		background: var(--bg-elevated, #1a1a1a);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		overflow: hidden;
		width: 320px;
		max-width: 92vw;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
	}
	.scan-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
	}
	.scan-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--accent);
	}
	.scan-close {
		background: none;
		border: none;
		color: var(--fg-subtle);
		cursor: pointer;
		font-size: var(--text-md);
	}
	.scan-close:hover {
		color: var(--fg-base);
	}
	.scan-video-wrap {
		position: relative;
		aspect-ratio: 1;
		background: #000;
	}
	.scan-video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.scan-frame {
		position: absolute;
		inset: 20%;
		border: 2px solid rgba(255, 255, 255, 0.5);
		border-radius: var(--radius-lg);
		pointer-events: none;
	}
	.scan-error {
		padding: var(--space-3) var(--space-4);
		font-size: var(--text-xs);
		color: var(--error);
		text-align: center;
	}
</style>
