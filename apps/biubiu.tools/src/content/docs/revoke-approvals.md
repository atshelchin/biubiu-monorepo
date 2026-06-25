---
title: Revoke Approvals
description: Find every contract that can still move your tokens and NFTs, and shut off risky unlimited approvals across many chains.
---

<script>
	import Callout from '$lib/content/Callout.svelte';
</script>

# Revoke Approvals

When you use a dapp, you often grant it permission to move a token on your behalf
— frequently an **unlimited** allowance. Those approvals don't expire. Months
later, a contract you forgot about can still move your funds if it's ever
compromised. **Revoke Approvals** finds them and lets you switch them off.

## What it checks

- **ERC-20** token allowances (including unlimited approvals).
- **ERC-721 / ERC-1155** NFT operator approvals (`setApprovalForAll`).
- **Permit2** allowances.

It scans across many EVM chains using public RPCs and a Multicall3 fast path, so a
sweep takes seconds rather than minutes.

## How to use it

1. Open the tool and enter (or connect) the address to inspect.
2. Pick the networks to scan.
3. Review the list of active approvals — each shows the token, the spender, and
   the allowance amount.
4. Select the ones to cancel and revoke them. With a smart-contract wallet you can
   **batch multiple revokes into a single signature**.

<Callout type="tip">
Revoking only removes a contract's permission to move tokens. It never moves your
funds and can't hurt your balances. When in doubt, revoke — you can always
re-approve later if you use the dapp again.
</Callout>

## Scope of the scan

The scan is built around fast, public-RPC-friendly queries rather than a deep
historical log crawl, which keeps it quick and avoids rate limits. It covers a
curated set of well-known tokens and spenders plus any you add yourself; a banner
in the tool always states exactly what the current scan covered.

<Callout type="warning">
A clean result means none were found **within the scanned scope** — not a
guarantee that no approval exists anywhere. Add custom tokens or networks if you
need to check something specific.
</Callout>

## Fees

Revoking is an on-chain transaction, so you pay network gas. The tool itself is
free.
