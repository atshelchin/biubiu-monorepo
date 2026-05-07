<script lang="ts">
	/**
	 * QR Code scanner button.
	 * Opens camera, detects QR codes via BarcodeDetector API, returns the value.
	 * Falls back to manual paste if BarcodeDetector is not available.
	 */

	interface Props {
		/** Called with the scanned QR code value */
		onScan: (value: string) => void;
	}

	let { onScan }: Props = $props();

	let scanning = $state(false);
	let error = $state('');
	let videoRef = $state<HTMLVideoElement | null>(null);
	let stream = $state<MediaStream | null>(null);

	const supported = typeof globalThis.BarcodeDetector !== 'undefined';

	async function startScan() {
		error = '';
		scanning = true;

		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment', width: { ideal: 720 }, height: { ideal: 720 } }
			});

			// Wait for video element to mount
			await new Promise((r) => requestAnimationFrame(r));
			if (videoRef) {
				videoRef.srcObject = stream;
				await videoRef.play();
				detectLoop();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Camera access denied';
			stopScan();
		}
	}

	function stopScan() {
		scanning = false;
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
		}
	}

	async function detectLoop() {
		if (!scanning || !videoRef || !stream) return;

		try {
			const detector = new BarcodeDetector({ formats: ['qr_code'] });
			const detect = async () => {
				if (!scanning || !videoRef) return;
				try {
					const codes = await detector.detect(videoRef);
					if (codes.length > 0) {
						const value = codes[0].rawValue;
						stopScan();
						onScan(value);
						return;
					}
				} catch {
					// Frame not ready yet
				}
				if (scanning) requestAnimationFrame(detect);
			};
			detect();
		} catch {
			error = 'QR detection not supported in this browser';
			stopScan();
		}
	}
</script>

{#if scanning}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="scan-overlay" role="presentation" onclick={stopScan}>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="scan-modal" onclick={(e) => e.stopPropagation()}>
			<div class="scan-header">
				<span class="scan-title">Scan QR Code</span>
				<button class="scan-close" onclick={stopScan}>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
				</button>
			</div>
			<div class="scan-video-wrap">
				<!-- svelte-ignore element_invalid_self_closing_tag -->
				<video bind:this={videoRef} class="scan-video" playsinline muted />
				<div class="scan-frame"></div>
			</div>
			{#if error}
				<div class="scan-error">{error}</div>
			{/if}
		</div>
	</div>
{/if}

{#if supported}
	<button class="scan-btn" onclick={startScan} title="Scan QR Code" type="button">
		<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>
	</button>
{/if}

<style>
	.scan-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 var(--space-2);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		color: var(--fg-faint);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		flex-shrink: 0;
		align-self: stretch;
	}

	.scan-btn:hover {
		color: var(--fg-muted);
		border-color: var(--border-base);
	}

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
		color: var(--fg-base);
	}

	.scan-close {
		background: none;
		border: none;
		color: var(--fg-subtle);
		cursor: pointer;
		padding: 2px;
		display: flex;
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
		top: 20%;
		left: 20%;
		right: 20%;
		bottom: 20%;
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
