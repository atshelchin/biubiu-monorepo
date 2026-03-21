<!--
  Premium 会员徽章。
  用在 PageHeader 用户名旁边，小巧精致。
-->
<script lang="ts">
	import { subscriptionStore } from './subscription-store.svelte.js';

	interface Props {
		/** 'sm' for header, 'md' for profile */
		size?: 'sm' | 'md';
	}

	let { size = 'sm' }: Props = $props();
</script>

{#if subscriptionStore.isPremium}
	<span class="badge badge-{size}" title="Premium Member">
		<svg class="badge-icon" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8 1.5l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 12.2 3.8 14.5l.8-4.7L1.2 6.5l4.7-.7z"/>
		</svg>
		PREMIUM
	</span>
{/if}

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-weight: 600;
		letter-spacing: 0.08em;
		background: linear-gradient(160deg, #c9a227, #a8851a);
		color: #fff;
		line-height: 1;
		flex-shrink: 0;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
	}

	.badge-sm {
		font-size: 8px;
		padding: 2.5px 6px;
		border-radius: 3px;
	}

	.badge-sm .badge-icon {
		width: 8px;
		height: 8px;
	}

	.badge-md {
		font-size: 10px;
		padding: 4px 10px;
		border-radius: 4px;
	}

	.badge-md .badge-icon {
		width: 10px;
		height: 10px;
	}
</style>
