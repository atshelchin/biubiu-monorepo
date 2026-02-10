<script lang="ts">
	import { t } from '$lib/i18n';

	const chains = [
		{
			name: 'Ethereum',
			color: '#627EEA',
			icon: `<svg viewBox="0 0 256 417" preserveAspectRatio="xMidYMid"><path fill="currentColor" d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z" opacity="0.6"/><path fill="currentColor" d="M127.962 0L0 212.32l127.962 75.639V154.158z"/><path fill="currentColor" d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.6L256 236.587z" opacity="0.6"/><path fill="currentColor" d="M127.962 416.905v-104.72L0 236.585z"/><path fill="currentColor" d="M127.961 287.958l127.96-75.637-127.96-58.162z" opacity="0.8"/><path fill="currentColor" d="M0 212.32l127.96 75.638v-133.8z" opacity="0.45"/></svg>`
		},
		{
			name: 'BNB Chain',
			color: '#F0B90B',
			icon: `<svg viewBox="0 0 126.61 126.61" preserveAspectRatio="xMidYMid"><path fill="currentColor" d="M38.73 53.2l24.59-24.58 24.6 24.6 14.3-14.31L63.32 0l-38.9 38.9zM0 63.31l14.3-14.31 14.31 14.31-14.31 14.3zM38.73 73.41l24.59 24.59 24.6-24.6 14.31 14.29-38.9 38.91-38.91-38.88zM98 63.31l14.3-14.31 14.31 14.3-14.31 14.32zM77.83 63.3L63.32 48.78 52.59 59.51l-1.24 1.23-2.54 2.54 14.51 14.5 14.51-14.47z"/></svg>`
		},
		{
			name: 'Polygon',
			color: '#8247E5',
			icon: `<svg viewBox="0 0 38.4 33.5" preserveAspectRatio="xMidYMid"><path fill="currentColor" d="M29 10.2c-.7-.4-1.6-.4-2.4 0L21 13.5l-3.8 2.1-5.5 3.3c-.7.4-1.6.4-2.4 0L5 16.3c-.7-.4-1.2-1.2-1.2-2.1v-5c0-.8.4-1.6 1.2-2.1l4.3-2.5c.7-.4 1.6-.4 2.4 0L16 7.2c.7.4 1.2 1.2 1.2 2.1v3.3l3.8-2.2V7c0-.8-.4-1.6-1.2-2.1l-8-4.7c-.7-.4-1.6-.4-2.4 0L1.2 5C.4 5.4 0 6.2 0 7v9.4c0 .8.4 1.6 1.2 2.1l8.1 4.7c.7.4 1.6.4 2.4 0l5.5-3.2 3.8-2.2 5.5-3.2c.7-.4 1.6-.4 2.4 0l4.3 2.5c.7.4 1.2 1.2 1.2 2.1v5c0 .8-.4 1.6-1.2 2.1L29 28.8c-.7.4-1.6.4-2.4 0l-4.3-2.5c-.7-.4-1.2-1.2-1.2-2.1V21l-3.8 2.2v3.3c0 .8.4 1.6 1.2 2.1l8.1 4.7c.7.4 1.6.4 2.4 0l8.1-4.7c.7-.4 1.2-1.2 1.2-2.1V17c0-.8-.4-1.6-1.2-2.1L29 10.2z"/></svg>`
		},
		{
			name: 'Arbitrum',
			color: '#28A0F0',
			icon: `<svg viewBox="0 0 470 514" preserveAspectRatio="xMidYMid"><path fill="currentColor" opacity="0.7" d="M291.134,237.469l35.654-60.5l96.103,149.684l0.046,28.727l-0.313-197.672c-0.228-4.832-2.794-9.252-6.887-11.859L242.715,46.324c-4.045-1.99-9.18-1.967-13.22,0.063c-0.546,0.272-1.06,0.57-1.548,0.895l-0.604,0.379L59.399,144.983l-0.651,0.296c-0.838,0.385-1.686,0.875-2.48,1.444c-3.185,2.283-5.299,5.66-5.983,9.448c-0.103,0.574-0.179,1.158-0.214,1.749l0.264,161.083l89.515-138.745c11.271-18.397,35.825-24.323,58.62-24.001l26.753,0.706L67.588,409.765l18.582,10.697L245.692,157.22l70.51-0.256L157.091,426.849l66.306,38.138l7.922,4.556c3.351,1.362,7.302,1.431,10.681,0.21l175.453-101.678l-33.544,19.438L291.134,237.469z M304.736,433.395l-66.969-105.108l40.881-69.371l87.952,138.628L304.736,433.395z"/><path fill="currentColor" opacity="0.9" d="M237.768,328.286l66.968,105.109l61.865-35.852l-87.953-138.628L237.768,328.286z"/><path fill="currentColor" opacity="0.9" d="M422.937,355.379l-0.046-28.727l-96.103-149.684l-35.654,60.5l92.774,150.043l33.544-19.438c3.29-2.673,5.281-6.594,5.49-10.825L422.937,355.379z"/><path fill="currentColor" opacity="0.5" d="M452.65,156.601c-0.59-14.746-8.574-28.245-21.08-36.104L256.28,19.692c-12.371-6.229-27.825-6.237-40.218-0.004c-1.465,0.739-170.465,98.752-170.465,98.752c-2.339,1.122-4.592,2.458-6.711,3.975c-11.164,8.001-17.969,20.435-18.668,34.095v208.765l30.115-46.271L50.07,157.921c0.035-0.589,0.109-1.169,0.214-1.741c0.681-3.79,2.797-7.171,5.983-9.456c0.795-0.569,172.682-100.064,173.228-100.337c4.04-2.029,9.175-2.053,13.22-0.063l173.022,99.523c4.093,2.607,6.659,7.027,6.887,11.859v199.542c-0.209,4.231-1.882,8.152-5.172,10.825l-33.544,19.438l-17.308,10.031l-61.864,35.852l-62.737,36.357c-3.379,1.221-7.33,1.152-10.681-0.21l-74.228-42.693l-15.163,25.717l66.706,38.406c2.206,1.255,4.171,2.367,5.784,3.272c2.497,1.4,4.199,2.337,4.8,2.629c4.741,2.303,11.563,3.643,17.71,3.643c5.636,0,11.132-1.035,16.332-3.072l182.225-105.531c10.459-8.104,16.612-20.325,17.166-33.564V156.601z"/><path fill="var(--bg-base)" d="M20.219,382.469l47.369,27.296l157.634-252.801l-26.753-0.706c-22.795-0.322-47.35,5.604-58.62,24.001L50.334,319.004l-30.115,46.271V382.469z"/><polygon fill="var(--bg-base)" points="316.202,156.964 245.692,157.22 86.17,420.462 141.928,452.565 157.091,426.849"/></svg>`
		},
		{
			name: 'Optimism',
			color: '#FF0420',
			icon: `<svg viewBox="0 0 500 500" preserveAspectRatio="xMidYMid"><circle fill="currentColor" cx="250" cy="250" r="250"/><path fill="var(--bg-base)" d="M177.133 316.446c-26.636 0-47.615-7.379-62.768-22.137-15.153-14.982-22.73-35.961-22.73-62.768 0-26.806 7.577-47.785 22.73-62.768 15.153-14.982 36.132-22.474 62.768-22.474 26.413 0 47.169 7.492 62.099 22.474 15.153 14.759 22.729 35.738 22.729 62.768 0 27.03-7.576 48.009-22.729 62.768-14.93 14.758-35.686 22.137-62.099 22.137zm0-38.285c13.587 0 24.185-4.589 31.761-13.543 7.8-9.178 11.7-21.802 11.7-37.851s-3.9-28.561-11.7-37.515c-7.576-9.178-18.174-13.767-31.761-13.767-13.811 0-24.521 4.589-32.098 13.767-7.576 8.954-11.364 21.466-11.364 37.515s3.788 28.673 11.364 37.851c7.577 8.954 18.287 13.543 32.098 13.543zM273.053 314.104V148.64h56.077c18.398 0 33.774 4.589 46.128 13.767 12.355 8.954 18.532 21.69 18.532 38.174 0 16.483-6.177 29.331-18.532 38.509-12.354 8.954-27.73 13.431-46.128 13.431h-14.772v61.583h-41.305zm41.305-97.21h10.038c8.022 0 14.199-1.79 18.532-5.373 4.557-3.806 6.835-9.066 6.835-15.781 0-6.716-2.278-11.864-6.835-15.446-4.333-3.807-10.51-5.71-18.532-5.71h-10.038v42.31z"/></svg>`
		},
		{
			name: 'Base',
			color: '#0052FF',
			icon: `<svg viewBox="0 0 111 111" preserveAspectRatio="xMidYMid"><circle fill="currentColor" cx="55.5" cy="55.5" r="55.5"/><path fill="var(--bg-base)" d="M55.4 93.3c20.9 0 37.8-16.9 37.8-37.8S76.3 17.7 55.4 17.7c-19.5 0-35.5 14.7-37.6 33.6h49.7v12.4H17.8c2.1 18.9 18.1 33.6 37.6 29.6z"/></svg>`
		}
	];
</script>

<div class="chains-section">
	<p class="chains-label">{t('hero.chainsSupported')}</p>
	<div class="chains-logos">
		{#each chains as chain}
			<div class="chain-chip" title={chain.name} style="--chain-color: {chain.color}">
				<span class="chain-icon">
					{@html chain.icon}
				</span>
				<span class="chain-name">{chain.name}</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.chains-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
		margin-top: var(--space-10);
	}

	.chains-label {
		font-size: var(--text-xs);
		color: var(--fg-faint);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: var(--weight-medium);
	}

	.chains-logos {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	/* Capsule/Chip style for chain logos */
	.chain-chip {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3) var(--space-1) var(--space-2);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: var(--radius-full);
		color: var(--fg-muted);
		transition: all var(--motion-normal) var(--easing);
		cursor: default;
	}

	.chain-chip:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: color-mix(in srgb, var(--chain-color) 30%, transparent);
		transform: translateY(-2px);
	}

	.chain-chip:hover .chain-icon {
		color: var(--chain-color);
	}

	.chain-chip:hover .chain-name {
		color: var(--fg-base);
	}

	.chain-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		color: var(--fg-subtle);
		transition: color var(--motion-fast) var(--easing);
	}

	.chain-icon :global(svg) {
		width: 100%;
		height: 100%;
	}

	.chain-name {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		transition: color var(--motion-fast) var(--easing);
	}

	@media (max-width: 768px) {
		.chains-logos {
			gap: var(--space-2);
			max-width: 100%;
		}

		.chain-chip {
			padding: var(--space-1) var(--space-2);
		}

		.chain-name {
			display: none;
		}

		.chain-icon {
			width: 20px;
			height: 20px;
		}
	}
</style>
