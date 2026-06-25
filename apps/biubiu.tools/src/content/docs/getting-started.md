---
title: Getting started
description: Open your first BiuBiu tool, connect a wallet when you need one, and understand what runs locally versus on-chain.
---

<script>
	import Callout from '$lib/content/Callout.svelte';
</script>

# Getting started

You don't need an account to start. Open the [home page](/), pick a tool, and
go. Some tools are read-only and need nothing; others sign transactions and ask
you to connect a wallet first.

## 1. Pick a tool

Each tool on the home page says what it does and what it needs. Read-only tools —
like [Balance Radar](/docs/balance-radar) and [Chain Explorer](/docs/chain-explorer)
— work immediately. Tools that move funds — like
[Token Sender](/docs/token-sender) — will prompt you to connect a wallet at the
point you actually need it.

## 2. Connect a wallet (only when needed)

When a tool needs to sign, you'll be asked to connect. BiuBiu supports a built-in
passkey wallet and external wallets — see [Wallets & accounts](/docs/wallets-and-accounts)
for the full picture.

<Callout type="tip">
The fastest path is the built-in **BiuBiu wallet**: it uses a passkey (Face ID,
Touch ID, or a security key), so there's no extension to install and no seed
phrase to write down.
</Callout>

## 3. Review before you sign

Anything that changes on-chain state is shown to you first — the recipient, the
amount, the network, and the fee. Nothing is submitted until you approve it with
your wallet.

<Callout type="warning">
Network gas and on-chain protocol fees always apply, even for free tools and Pro
members. A tool being free means the **platform** doesn't charge you — it can't
waive the network's own costs.
</Callout>

## What runs where

- **In your browser:** address lists, scanning, filtering, report generation,
  key generation, and encryption. This data doesn't leave your device unless a
  tool explicitly sends a transaction.
- **On-chain:** only the transactions you approve, signed by your wallet.

## Next steps

- **[Wallets & accounts](/docs/wallets-and-accounts)** — choose how you connect.
- **[Privacy & security](/docs/privacy-and-security)** — what we do and don't
  collect.
- **[FAQ](/docs/faq)** — quick answers to common questions.
