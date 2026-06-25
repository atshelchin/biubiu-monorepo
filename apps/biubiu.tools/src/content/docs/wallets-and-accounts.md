---
title: Wallets & accounts
description: The built-in passkey wallet, plus the external wallets BiuBiu supports — and why every connected wallet must be a smart contract account.
---

<script>
	import Callout from '$lib/content/Callout.svelte';
</script>

# Wallets & accounts

BiuBiu Tools never asks for a seed phrase and never holds your keys. You connect
a wallet only when a tool needs to sign, and you can disconnect at any time.

## Three ways to connect

### 1. BiuBiu built-in wallet (recommended)

A passkey-backed smart account. Your signing key lives in your device's secure
hardware and you authorize with Face ID, Touch ID, or a security key. There's no
extension to install and no phrase to back up.

- It's a **Safe smart account** operated with ERC-4337 account abstraction.
- The same address works across every supported network.
- Recovery is your responsibility: sync your passkey via iCloud Keychain, Google
  Password Manager, or a hardware key.

<Callout type="danger" title="No recovery, no exceptions">
Your passkey is the only way into a built-in account. There is no password and no
email reset. If you lose the device and have no synced copy of the passkey, the
account is gone for good. Set up passkey sync before you deposit funds.
</Callout>

### 2. Injected browser wallet

Any wallet that implements EIP-6963 discovery (browser extensions and in-app
browsers). BiuBiu detects them automatically when you choose to connect one.

### 3. WalletPair (scan to pair)

Pair a compatible wallet by scanning a QR code, then verify the short code matches
on both screens before continuing.

## Why smart-contract wallets only

Every connected wallet must be a **smart contract account** — either a native
smart account or a plain EOA upgraded via EIP-7702.

<Callout type="info">
A plain, un-upgraded EOA will be rejected at connect time. Smart accounts are
what make features like atomic batches, fee sponsorship, and clear on-chain
authorization possible.
</Callout>

## Disconnecting

Disconnecting removes the wallet from this session. For the built-in wallet, your
passkey stays on your device — you can sign back in anytime. Nothing is deleted
on-chain.

## Next steps

- **[Pro membership](/docs/membership)** — waive platform service fees on certain
  tools.
- **[Privacy & security](/docs/privacy-and-security)** — how identity and signing
  work under the hood.
