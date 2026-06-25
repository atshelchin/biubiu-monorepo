---
title: Privacy & security
description: How BiuBiu Tools handles your data and keys — what runs locally, what goes on-chain, and the self-custody trust model.
---

<script>
	import Callout from '$lib/content/Callout.svelte';
</script>

# Privacy & security

BiuBiu Tools is built so that the sensitive parts of your work never have to leave
your device. This page explains the model so you can verify it for yourself.

## Self-custody

You hold your keys. BiuBiu cannot move, freeze, recover, or refund your funds.
The only on-chain actions that happen are the transactions **you** approve and
sign with your own wallet.

## What stays on your device

- **Address lists, scan inputs, and reports** (e.g. in Balance Radar) are
  processed in your browser and not uploaded.
- **Generated keys and encryption** happen locally. Air-gapped flows are designed
  to work fully offline.
- **Your passkey** lives in your device's secure hardware. The private key never
  leaves it and BiuBiu never sees it.

## What goes on-chain

Only the transactions you approve. Before you sign, the tool shows the action in
human-readable terms — recipient, amount, network, and fee.

<Callout type="info">
Reading public chain data (balances, allowances, chain metadata) goes to RPC
endpoints. You can point tools at your own RPC in settings if you'd rather not use
public ones.
</Callout>

## No blind signing

Transactions are decoded and presented in plain language. Unknown or unusual
calls are flagged rather than hidden behind raw hex.

## The risk you own

<Callout type="danger" title="There is no recovery for a lost passkey">
A built-in BiuBiu account is controlled only by your passkey. There is no
password, no email reset, and no support team that can restore it. Sync your
passkey (iCloud Keychain, Google Password Manager, or a hardware key) before you
deposit anything.
</Callout>

## Verify it yourself

The toolkit is [open source on GitHub](https://github.com/atshelchin/biubiu-monorepo).
If a claim on this page matters to you, you can read the code that backs it.
