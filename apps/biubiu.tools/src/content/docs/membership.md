---
title: Pro membership
description: What BiuBiu Pro waives, what it doesn't, and how the membership is held and verified.
---

<script>
	import Callout from '$lib/content/Callout.svelte';
</script>

# Pro membership

BiuBiu Pro removes the **platform service fee** on the tools that charge one —
notably [Token Sender](/docs/token-sender) and Wallet Sweep. Most tools are free
for everyone; Pro is for people who lean on the fee-bearing ones often.

## What Pro waives

- The platform service fee on fee-bearing tools.

## What Pro does *not* waive

<Callout type="warning">
Pro only waives BiuBiu's own service fee. **Network gas, bundler fees, and any
on-chain protocol fees still apply** — those go to the network and to third
parties, not to BiuBiu, so they can't be waived.
</Callout>

## How it works

Membership is represented by an on-chain subscription you hold yourself. You can
**subscribe**, **renew**, or **transfer** it to another address. Pricing is shown
before you pay, with a small buffer for price fluctuation; any excess is
refunded.

## Verification

To apply the fee waiver, BiuBiu confirms you really control the member account by
asking for a fresh passkey assertion and verifying the signature.

<Callout type="info">
This proof step is why simply *watching* a member's address isn't enough to get
the waiver — you have to be able to sign as that account. The waiver also clears
automatically when you switch accounts or sign out.
</Callout>

## Managing your membership

Open your profile to see status and expiry, renew before it lapses, or transfer
the membership NFT to a new address — the recipient becomes the new owner.
