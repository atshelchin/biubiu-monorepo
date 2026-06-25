---
title: FAQ
description: Quick answers about accounts, fees, privacy, supported chains, and what BiuBiu Tools can and can't do.
---

# FAQ

## Do I need an account to use the tools?

No. Most tools work with no sign-up. You only connect a wallet when a tool needs
to sign a transaction, and only at that moment.

## Is it free?

The toolkit is free. A few tools that submit transactions charge a small platform
service fee, which [Pro members](/docs/membership) don't pay. **Network gas and
on-chain protocol fees always apply** — those aren't ours to waive.

## Does BiuBiu hold my funds or keys?

No. BiuBiu is fully self-custodial. Your keys stay on your device, and only the
transactions you sign happen on-chain. BiuBiu can't move, freeze, or recover your
funds.

## What wallets can I connect?

The built-in passkey wallet, injected browser wallets (EIP-6963), and WalletPair.
Every connected wallet must be a smart-contract account (or an EOA upgraded via
EIP-7702). See [Wallets & accounts](/docs/wallets-and-accounts).

## I lost my passkey. Can you recover my account?

No — and neither can anyone else. A built-in account has no password or email
reset. This is the trade-off of true self-custody. Sync your passkey across
devices before depositing funds. See [Privacy & security](/docs/privacy-and-security).

## Which networks are supported?

The major EVM chains out of the box, plus any custom network you add. Browse them
in the [Chain Explorer](/docs/chain-explorer).

## Is my data sent to a server?

Sensitive inputs — address lists, generated keys, encryption — are processed in
your browser. Reading public chain data uses RPC endpoints, which you can swap for
your own. See [Privacy & security](/docs/privacy-and-security).

## A scan came back empty. Does that mean I'm safe?

It means nothing was found **within the scope that was scanned**. Tools state what
they covered; widen the scope (custom tokens, more networks) if you need to check
something specific.

## How do I report a bug or request a tool?

The project is [open source on GitHub](https://github.com/atshelchin/biubiu-monorepo)
— open an issue there, or reach the team through the links in the footer.
