---
title: Why you should revoke old token approvals
description: Token approvals don't expire. The dapp you used once last year may still be able to move your funds — here's why that matters and how to clean it up.
date: 2026-06-24
author: BiuBiu Tools
tags: [security, guide, approvals]
---

Here's a risk most people never think about: the dapps you've used can often
still move your tokens, long after you've stopped using them. Not because they're
malicious — but because of how approvals work.

## How approvals work

ERC-20 tokens don't let a contract take your funds directly. Instead, you grant an
**allowance**: "this contract may move up to *X* of this token on my behalf." A
swap, a bridge, an NFT marketplace — they all need this to function.

The catch is that, for convenience, most dapps request an **unlimited** allowance
so they never have to ask again. And that allowance:

- **doesn't expire,**
- **persists after you stop using the dapp,** and
- **stays exactly as risky as the contract that holds it.**

## Why that's a problem

An allowance is only as safe as the contract you granted it to. If that contract
is later exploited, upgraded by a malicious admin, or simply had a bug all along,
your tokens are reachable — up to the allowance you granted, which is often
"all of them."

You did nothing wrong and your keys were never compromised. The standing
permission is the whole attack surface.

> A good habit: treat approvals like app permissions on your phone. Grant what you
> need, and revoke what you no longer use.

## How to clean it up

This is exactly what [Revoke Approvals](/docs/revoke-approvals) is for:

1. Open the tool and enter or connect the address you want to inspect.
2. Pick the networks to scan. It uses public RPCs and a Multicall fast path, so a
   sweep takes seconds.
3. Review what's still active — ERC-20 allowances, NFT operator approvals, and
   Permit2.
4. Select the ones you don't recognize or no longer use, and revoke. With a
   smart-contract wallet, you can batch several revokes into **one signature**.

Revoking never moves your funds and can't damage your balances — it only removes a
contract's permission. If you need that dapp again later, you simply approve again.

## A reasonable routine

You don't need to do this daily. A quick scan every few months, and right after
you stop using a dapp, keeps your standing exposure small. Five minutes now beats
finding out the hard way later.

Start here: [Revoke Approvals →](/docs/revoke-approvals)
