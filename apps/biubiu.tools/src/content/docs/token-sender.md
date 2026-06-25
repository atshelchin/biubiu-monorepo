---
title: Token Sender
description: Batch-send a coin or ERC-20 to thousands of addresses from your own wallet — one signature per batch via Safe MultiSend.
---

<script>
	import Callout from '$lib/content/Callout.svelte';
</script>

# Token Sender

**Token Sender** sends a native coin or an ERC-20 to many recipients at once,
straight from your own self-custodial wallet. Instead of signing hundreds of
transfers, you approve one batch.

## How it works

Transfers are bundled with **Safe MultiSend** and submitted as a single
transaction from your smart account — so a batch of recipients costs you **one
signature**. Large lists are split into multiple batches automatically.

## How to use it

1. Connect a wallet (the built-in passkey wallet works well here).
2. Choose the network and the asset — native coin or an ERC-20.
3. Provide recipients and amounts: paste them, or upload a file with one
   `address,amount` pair per line.
4. Review the totals — recipient count, total amount, and estimated fees.
5. Confirm. Each batch is one signature.

<Callout type="warning">
Double-check your list before confirming. On-chain transfers are irreversible —
there is no undo, and BiuBiu cannot reverse or refund a transaction.
</Callout>

## Capacity

The tool is built to handle very large recipient lists (up to ~100k), splitting
them into batches sized to fit comfortably within block gas limits.

## Fees

- **Network gas** for each batch — always applies.
- **A platform service fee** — waived for [Pro members](/docs/membership).

<Callout type="info">
Pro waives the **platform** service fee only. Network gas and any on-chain
protocol fees still apply to everyone.
</Callout>
