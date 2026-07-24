<script lang="ts">
	/**
	 * Drop-in in-band gas fee row for any send/confirm surface that goes through a ConnectedWallet.
	 *
	 * Only renders for the biubiu passkey Safe (the sole in-band wallet) on non-Tempo chains — it
	 * pulls the Safe address + passkey public key from authStore, resolves the network slug from
	 * chainId, and delegates to FeeAssetSelector. External wallets pay their own gas, so it renders
	 * nothing and leaves `gasFeeToken` null. Wiring a surface is then a one-liner + passing
	 * `gasFeeToken`/`quotedFee` into `wallet.sendCalls(..., opts)`.
	 */
	import type { Address } from 'viem';
	import { authStore } from './auth-store.svelte.js';
	import { slugForChainId, isTempoChain } from '$lib/wallet/infra/chains.js';
	import FeeAssetSelector from './FeeAssetSelector.svelte';
	import type { Call } from '$lib/wallet/types.js';
	import type { InBandFeeQuote } from './safe-tx/send-contract-call.js';

	interface Props {
		/** `wallet.kind` — the selector only applies to the biubiu passkey Safe (in-band). */
		walletKind: string;
		chainId: number;
		/** The send's user call(s), for the fee estimate. */
		calls: Call[];
		/** Only load/estimate while the confirm surface is active with a valid amount. */
		active: boolean;
		/** Chosen fee asset: null = native, else a held stablecoin. Bind + pass to sendCalls opts. */
		gasFeeToken?: Address | null;
		/** Out: the displayed fee quote. For a single send, pass to sendCalls as `quotedFee`. */
		quotedFee?: InBandFeeQuote | null;
	}

	let {
		walletKind,
		chainId,
		calls,
		active,
		gasFeeToken = $bindable(null),
		quotedFee = $bindable(null)
	}: Props = $props();

	const user = $derived(authStore.user);
	const network = $derived(slugForChainId(chainId));
	const show = $derived(walletKind === 'biubiu' && !!user && !!network && !isTempoChain(chainId));
</script>

{#if show && user && network}
	<FeeAssetSelector
		{chainId}
		safeAddress={user.safeAddress}
		publicKeyHex={user.publicKey}
		{network}
		{calls}
		{active}
		bind:gasFeeToken
		bind:quotedFee
	/>
{/if}
