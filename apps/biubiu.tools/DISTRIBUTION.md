# biubiu.tools — Distribution Engine (backlinks → DR → ranking)

> The goal of this file is **one thing**: raise domain authority so your ~2600 pages
> climb from page 2 (avg position ~15) onto page 1. Backlinks are the main lever.
> This is the **off-page** track; the on-page track (keyword titles, browse index) is already shipped.
>
> **You are sell-averse — so this list is ordered by "least human contact first."**
> GitHub PRs and form submissions need zero selling. Product Hunt (social) is LAST, optional.
> Do NOT let "I should build a perfect alternative page first" become a reason to delay the
> async submissions below. You already have great destination pages (2600 chain pages + tool pages).

## The weekly loop (≈2–3 h/week, all async)

1. **Mon (15 min):** open Google Search Console → Performance → check **Average position** (overall + on a few target queries). Log the number below. *This is your leading indicator — it moves weeks before clicks.*
2. **Submit 5 listings** from the worklist (left-to-right). Paste the right positioning variant. Log date + status.
3. **Once a listing is live**, confirm the backlink is real & dofollow:
   `curl -sIL https://thedirectory.com/your-listing | grep -i 'rel='` (no `rel=nofollow` near your link = dofollow).
4. **Never** evaluate by clicks/users before day 90. Judge by: referring domains ↑, indexed pages ↑, average position ↑.

## Leading-indicator log (fill weekly)

| Date | Indexed pages (GSC) | Avg position (GSC) | Referring domains | Listings live |
|------|---------------------|--------------------|-------------------|---------------|
| 2026-06-25 | ~200 | 15.3 | ? | 0 |
|  |  |  |  |  |

> Free DR / referring-domains check: Ahrefs Free Webmaster Tools, or `ahrefs.com/backlink-checker`, or `dofollow.tools`.

---

## TRACK 1 — Async submissions (start TODAY, zero selling)

Ordered by ROI = domain rating × fit × (low effort). **Tier A = highest value, do first.**

### Tier A — high DR, dofollow, near-zero assets needed

| # | Target | Type | ~DR | Link | Assets needed | Status | Date |
|---|--------|------|-----|------|---------------|--------|------|
| 1 | GitHub `awesome-web3` (PR add your tool) | awesome-list | 95 | github.com | URL + 1-line desc | ☐ | |
| 2 | GitHub `awesome-ethereum` (PR) | awesome-list | 95 | github.com | URL + desc | ☐ | |
| 3 | GitHub `awesome-blockchain` / `awesome-dapps` (PR) | awesome-list | 95 | github.com | URL + desc | ☐ | |
| 4 | GitHub `awesome-solidity` / `awesome-evm` (PR, for contract-caller/dev tools) | awesome-list | 95 | github.com | URL + desc | ☐ | |
| 5 | AlternativeTo — list as **Chainlist alternative** | SaaS dir | 88 | alternativeto.net | logo + desc + screenshot | ☐ | |
| 6 | AlternativeTo — list as **revoke.cash alternative** | SaaS dir | 88 | alternativeto.net | logo + desc | ☐ | |
| 7 | Crunchbase — create company profile | business | 91 | crunchbase.com | logo + desc | ☐ | |
| 8 | LinkedIn — create Company Page | business | 98 | linkedin.com | logo + desc | ☐ | |
| 9 | Wikidata — create an entry (feeds AI training corpora) | knowledge | 96 | wikidata.org | facts | ☐ | |
| 10 | StackShare — add the tool/stack | dev | 85 | stackshare.io | logo + desc | ☐ | |

### Tier B — web3/dev-specific directories (verify each: DR>20, real traffic, editorial)

> Search these out (I'm not 100% on every current URL — vet before submitting):
> "submit web3 tool directory", "web3 tools list", "ethereum developer tools directory",
> "crypto tools directory submit". Reject anything DR<10 / link-farm-looking.

| # | Target | Type | Link | Status | Date |
|---|--------|------|------|--------|------|
| 11 | DappRadar (if/where a tool listing fits) | dapp dir | dappradar.com | ☐ | |
| 12 | Alchemy / thirdweb / web3 "ecosystem" tool lists | dev ecosystem | — | ☐ | |
| 13 | web3-specific tool aggregators (vet DR) | web3 dir | — | ☐ | |
| 14 | "Chainlist alternative" listicles (find top 5, request inclusion) | listicle | — | ☐ | |
| 15 | "revoke.cash alternative" listicles | listicle | — | ☐ | |

### Tier C — general SaaS/indie directories (accept free, no-signup tools)

| # | Target | ~DR | Status | Date |
|---|--------|-----|--------|------|
| 16 | SaaSHub (alternative-to framing) | 70 | ☐ | |
| 17 | BetaList | 78 | ☐ | |
| 18 | Toolify / There's An AI For That (only if you frame an AI angle) | 70+ | ☐ | |
| 19 | Fazier / DevHunt / Uneed | 40–60 | ☐ | |
| 20 | Indie Hackers — products page + a build-in-public post | 80 | ☐ | |

### Tier D — your strength: write 1 technical post (dofollow + dev audience + AI citation fuel)

| # | Target | Why | Status | Date |
|---|--------|-----|--------|------|
| 21 | Dev.to post: "How I made an EVM chain explorer rank for 2600 chains (programmatic SEO)" — canonical back to biubiu.tools | dofollow DR 90, devs, Google/Claude/Perplexity index it | ☐ | |
| 22 | Cross-post to Hashnode with canonical URL | dofollow DR 80 | ☐ | |

### Tier E — Product Hunt (LAST, optional — this is the social-heavy one you hate)

> PH needs a 3-week social warm-up and constant comment replies on launch day. That's exactly the
> muscle you avoid. **Skip it until Tracks 1–2 have given you momentum**, or do it only when you can
> commit one focused launch day. Do NOT make it the first thing — async wins compound without it.

---

## TRACK 2 — Build destination pages (your strength; parallel, not a blocker)

Backlinks land better when they point at pages that *target the search intent*. You already have
the chain pages; add a few **alternative pages** that capture high-intent "X alternative" queries
and give Tier A/B/C links a strong place to land:

- [ ] `/alternatives/chainlist` — honest table: biubiu vs chainlist (live latency, 2600 chains, no signup, 15 langs). Target: "chainlist alternative".
- [ ] `/alternatives/revoke-cash` — for the revoke tool. Target: "revoke.cash alternative".
- [ ] `/alternatives/etherscan-write-contract` — for contract-caller.
- [ ] Each page: single `<h1>`, honest comparison table, "when to use which", FAQ. (Tell Claude Code "build the chainlist alternative page" — it's a programmatic build.)

---

## Paste-ready positioning (vary the opening per surface — don't copy one everywhere)

**Tagline (<10 words):**
> Free web3 tools — chains, balances, approvals, wallet sweeps. No signup.

**Short (60 chars):**
> Free EVM chain explorer & wallet tools. No login.

**Long — DEV directories (lead with technical depth):**
> biubiu.tools is a suite of free, no-signup web3 utilities: a chain explorer covering ~2600 EVM
> networks (live-probed RPC latency, chain IDs, one-click add-to-MetaMask), plus a multichain balance
> radar, batch token sender, EIP-7702 wallet sweeper, an approval revoker, and a raw contract caller.
> Client-side, self-custodial, open and fast. Built for developers and power users.

**Long — SaaS/AlternativeTo (lead with alternative framing):**
> A faster, cleaner Chainlist alternative — and more. Browse ~2600 EVM chains with live RPC latency
> sorting and one-click MetaMask add, then revoke token approvals (a revoke.cash alternative), check
> balances across chains, batch-send tokens, and sweep wallets via EIP-7702. Free, no signup, 15 languages.

**Long — general/startup (lead with outcome):**
> Everything you need to use any EVM chain, in one free place: find a working RPC in seconds, add a
> network to your wallet with one click, revoke risky approvals, move funds, and check balances —
> across ~2600 chains, no signup, no tracking.

---

## What NOT to do (adapted to you)
- Don't pay for "submit to 200 directories" services — it's an afternoon of copy-paste.
- Don't submit to DR<10 link farms — they can hurt, not help.
- Don't paste the **same** long description everywhere — vary the opening (AI engines down-weight duplicates).
- Don't build the "perfect" alternative page before doing Track 1 — async submissions need no destination beyond what you already have.
- Don't judge by clicks before day 90 — judge by referring domains / indexed pages / average position.
