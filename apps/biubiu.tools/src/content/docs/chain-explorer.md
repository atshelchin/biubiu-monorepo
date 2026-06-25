---
title: Chain Explorer
description: Browse 800+ EVM networks, find RPC endpoints and block explorers, test RPC latency, and add a chain to your wallet in one click.
---

<script>
	import Callout from '$lib/content/Callout.svelte';
</script>

# Chain Explorer

**Chain Explorer** is a fast, searchable directory of EVM networks. Look up any
chain by name or chain ID and get everything you need to connect to it: RPC
endpoints, the native currency, block explorers, and network metadata.

## What you can do

- **Search 800+ chains** by name or chain ID.
- **See the details** — chain ID, native symbol, explorers, and known RPC URLs.
- **Test RPC latency** to find a responsive endpoint before you rely on it.
- **Add to your wallet** in one click on supported wallets.

## Add a network to your wallet

On a chain's page, use **Add to wallet**. BiuBiu requests the accounts, switches
to the chain if your wallet already knows it, and otherwise adds it with the
right parameters.

<Callout type="info">
Adding a network only works over a secure (HTTPS) connection and with a wallet
that supports the standard add/switch-chain requests.
</Callout>

## Custom networks

If a chain isn't listed, you can add a custom network anywhere a network picker
appears — give it a name, chain ID, RPC URL(s), and native symbol. Entering a
chain ID can auto-fill the rest from the public chain registry.

<Callout type="tip">
Prefer a private RPC for heavy use. Public endpoints are convenient but can be
slow or rate-limited; add your own key in settings for the chains you use most.
</Callout>
