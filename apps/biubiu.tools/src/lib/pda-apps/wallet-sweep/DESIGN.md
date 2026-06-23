# Wallet Sweep — Design

Drain native coin + selected ERC20s out of many EOAs into one destination,
controlled by the user's biubiu.tools passkey Safe, via **EIP-7702**.

## Two-phase model

**Phase A — Upgrade (relayer, type-4):** each pasted EOA signs a 7702
authorization delegating its code to a deployed **`Sweeper7702`** contract whose
`controller` is hard-wired (`immutable`) to the user's passkey Safe. A
throwaway, zero-privilege relayer EOA broadcasts one type-4 transaction per
chunk (≤ `maxBatchUpgrade`, default 100) carrying all those authorizations. The
relayer holds no power — the Sweeper only ever obeys the Safe.

**Phase B — Sweep (passkey Safe, repeatable):** the Safe delegatecalls Safe
MultiSend (`operation=1`), which CALLs `eoa.sweep(dest, erc20s)` on every
upgraded EOA. Each EOA sees `msg.sender == Safe == controller`. One MultiSend
batch = one passkey fingerprint. EOAs stay upgraded, so later sweeps are one tap.

## Fee (identical policy to token-sender)

`infra/fee.ts` reuses token-sender's constants (`FEE_COLLECTOR`, `FEE_USD`,
`FEE_FALLBACK_NATIVE`, `FEE_FIXED_NATIVE`) and `FeeQuote` type. Priority:
member (`subscriptionStore.isPremium`) → free; else fixed-per-network →
$5-equiv via Chainlink native/USD → 1-native fallback. Charged **once per
sweep**, prepended as the first sub-tx of the **first** MultiSend batch
(`{ to: FEE_COLLECTOR, value: feeWei }`), so the Safe pays it from its own
native — exactly like token-sender. Quoted in `preflight()`, shown in
preview + sweep, persisted on the history record (`feeWei`, `isMember`).

## Why a relayer (not the bundler)

A type-4 tx must be sent by an EOA; the Safe is a contract. ERC-4337's 7702
integration only upgrades a UserOp's *own sender* and needs EntryPoint v0.8
(this codebase is v0.7), so the bundler can't carry authorizations for foreign
EOAs. The relayer is funded one-tap from the Safe (`fund-relayer.ts`), with a
manual QR/address fallback.

## Contract — `apps/biubiu-contracts/src/eip7702/Sweeper7702.sol`

Per-Safe, stateless, immutable controller. No EOA storage writes ⇒ no re-init
race, no storage collision. Address is deterministic per Safe (CREATE2, fixed
salt; uniqueness from the constructor arg) and deployed lazily per (chain, Safe)
via the Arachnid proxy. ERC20 transfers are best-effort (low-level calls tolerate
USDT-style / reverting tokens); native is sent last and hard-fails on a bad dest.

## Network whitelist (`infra/networks.ts`)

Base, Optimism, Arbitrum, Polygon, BNB, Gnosis (+ Polygon Amoy testnet). Slugs
match `CHAIN_CONFIG` so Phase B routes through `sendContractCall`. Each is
probed live (`probeNetwork`): RPC reachable + RIP-7212 P256 + Safe MultiSend
present. Ethereum mainnet is excluded (no P256 precompile).

## Key correctness rules

- **7702 nonce (sponsored)** = EOA's current *pending* nonce, **no +1**
  (account-level `signAuthorization`). `chainId` = real chain id.
- A **writable RPC** is required for type-4 broadcast (read RPCs / bundler can't).
- The **first sweep auto-deploys** the counterfactual Safe (`send-contract-call`
  `initCode` path) — higher first-batch gas only.
- **Private keys never leave the browser** and are never persisted; only the
  throwaway relayer key + address-level history (IndexedDB) are stored.

## Files

- `infra/` — `networks`, `sweeper-artifact` (compiled bytecode), `sweeper-address`
  (CREATE2 predict), `relayer`, `deploy-sweeper`, `authorizations`, `upgrade`,
  `revoke`, `balances`, `erc20`, `sweep-multisend`, `fund-relayer`, `viem-chain`,
  `tx-utils`.
- `store.svelte.ts` — 3-step wizard (**config → run → done**). The merged "run"
  step funds the relayer (if needed) then runs deploy → upgrade → sweep back to
  back via `proceed()` → `runAll()`; `runStage` drives the progress timeline.
  `sweepAgain()` re-sweeps from done; plus revoke + history.
- `history/sweep-history.ts` — IndexedDB.
- route `routes/apps/wallet-sweep/+page.svelte` + `components/AddTokenModal.svelte`
  + `components/KeysEditor.svelte` (proeditor `LineEditor` + `FileUploadModal` —
  paste **or file import**, per-line validation, duplicate detection; same editor
  token-sender uses).

## Regenerating the contract artifact

```
cd apps/biubiu-contracts
forge build && forge test --match-contract Sweeper7702Test
forge inspect src/eip7702/Sweeper7702.sol:Sweeper7702 bytecode
# paste into infra/sweeper-artifact.ts (SWEEPER_BYTECODE)
```
Cross-check: TS `predictSweeperAddress(safe)` must equal the Foundry
`Sweeper7702.s.sol printAddress(<safe>)` output. Verified for controller
`0x1111…1111` → `0xfCdD9Cd31Ed5E6B3D7b96D987066F1658d4B1078`.
