---
title: Balance Radar
description: Bulk-check native and token balances for thousands of addresses across multiple chains, then export a report.
---

<script>
	import Callout from '$lib/content/Callout.svelte';
</script>

# Balance Radar

**Balance Radar** answers a question that's tedious to answer by hand: *how much
is held across all of these addresses, on all of these chains?* Paste a list of
addresses, choose your networks and tokens, and get a report in minutes.

## What it's good for

- Auditing a set of wallets you control.
- Checking distribution or airdrop recipient lists.
- Reconciling holdings across chains before a migration or report.

## How to use it

1. Open the tool and paste your address list (one per line), or load a file.
2. Choose the networks to query.
3. Choose the tokens — native coin and any ERC-20s you specify.
4. Run the scan and watch results stream in.
5. Export the report as CSV or JSON.

<Callout type="tip">
Balance Radar is **read-only**. It never asks you to connect a wallet or sign
anything, because checking a balance is a public on-chain read.
</Callout>

## Performance and limits

Queries are batched per chain to stay fast and within public-RPC limits. Very
large lists are processed progressively so the page stays responsive. If a
specific network is slow or rate-limited, add your own RPC endpoint in settings
for that chain.

<Callout type="info">
Balance data is fetched live and rendered in your browser. Your address list is
not uploaded to a BiuBiu server — it stays on your device.
</Callout>

## Tips

- Keep token lists tight: only query the tokens you care about for faster runs.
- Re-running uses the same list, so you can refresh a report without re-pasting.
