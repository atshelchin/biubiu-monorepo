# Wallet Sweep — Design (v2 relay-centric + v3 universal fallback)

Drain native coin + selected ERC20s out of many EOAs into one destination. **No
passkey, no login, no Safe.** A throwaway **relay EOA** (which the user funds and
downloads) does all the on-chain work.

**Two execution paths, chosen per network (`infra/sweep-executor.ts`):**

- **EIP-7702 (`supports7702: true`, curated Pectra chains)** — the fast path below:
  one type-4 tx per chunk upgrades & sweeps ~50 EOAs; source EOAs need zero native.
- **Universal refuel (`supports7702: false`, ANY other EVM chain — the default for
  all custom-added chains)** — `infra/refuel-sweep.ts`. Because the app already
  holds every source EOA's **private key**, on a chain that can't delegate we drain
  each EOA the boring way: the relay sends it just-enough gas, then that EOA
  self-sends its ERC20s (`transfer(dest, bal)`) and finally its native to `dest`.
  Contract-free, legacy/1559-aware, idempotent (every action = "move current
  balance to dest", so a re-run finishes an interrupted one). See §"Universal path".

## Flow

1. **Config** — pick any EIP-7702 chain (curated list + add-custom), paste/​import
   private keys, choose ERC20s (native always swept), enter the destination.
2. **Run**
   - The relay key must be **downloaded**, then the download **proven by
     re-uploading the file** (`verifyRelayFile`) before the funding QR/address is
     shown. The user funds the relay with gas.
   - **One click** then runs: deploy contracts (if missing) → for each chunk, a
     single **type-4 transaction** that upgrades the chunk's EOAs (7702
     `authorizationList`) *and* sweeps them via `BatchSweeper.sweepMany`.
3. **Done** — results + **re-sweep** (funds re-arrived), **revoke**, **recover
   leftover relay gas** to the destination, and history.

## Contracts (`apps/biubiu-contracts/src/eip7702/`)

- **`Sweeper7702(controller)`** — per-relay 7702 delegate. `sweep(dest, erc20s)`
  is guarded by **`tx.origin == controller`** (the relay), NOT msg.sender — so
  the relay can sweep ~100 EOAs in one tx by going through BatchSweeper (inside
  the loop msg.sender is BatchSweeper, but tx.origin stays the relay). `tx.origin`
  is safe here: the relay is a dedicated key that only ever originates txs to our
  own contracts. Stateless immutable controller → per-relay CREATE2 address.
- **`BatchSweeper`** — global, deterministic. `sweepMany(eoas, dest, erc20s,
  feeCollector)` payable: forwards `msg.value` (the fee) to `feeCollector`, then
  loops `try eoa.sweep(...)` (one failure is skipped, never blocks the batch).
  No auth needed — security lives in Sweeper's tx.origin check.

Both deployed lazily by the relay via the Arachnid CREATE2 proxy. Foundry tests
cover tx.origin auth, batch sweep, fee forwarding, bad-EOA skip, repeatability.

## Fee (paid by the relay)

`infra/fee.ts` reuses token-sender's constants. Amount priority: fixed-per-network
→ $5-equiv (Chainlink) → 1-native fallback. **No membership** (v2 has no passkey).
Charged once per sweep as `msg.value` on the first chunk; BatchSweeper forwards it
to `FEE_COLLECTOR`. Included in the relay funding estimate.

## Key correctness / safety

- **7702 nonce (sponsored)** = the EOA's current pending nonce, no +1.
- **RPC failover** (`infra/rpc.ts` + viem `fallback`) across each network's RPCs;
  per-account calls (getCode / nonce) are **concurrency-limited** (`mapLimit`, 12)
  and balances go through **Multicall3** (chunked) — so 1000 keys ≠ 1000 requests.
- **Private keys never leave the browser / are never persisted.** Only the relay
  key (per network) and address-level history are persisted.
- The relay can only send to the **destination fixed per transaction**; even a
  stolen relay key can spend gas but not redirect a sweep.

## Files

- contracts: `Sweeper7702.sol`, `BatchSweeper.sol` (+ tests, deploy script).
- `infra/` — `rpc` (failover), `viem-chain`, `networks` (broad 7702 list + custom),
  `sweeper-address` + `*-artifact` (both contracts), `deploy-sweeper` (ensure both),
  `authorizations`, `sweep` (combined upgrade+sweep / re-sweep), `revoke`,
  `balances` (multicall), `erc20`, `fee`, `relayer` (download / verify-upload /
  recover-gas / funding estimate), `tx-utils` (chunk / mapLimit / waitForReceipt).
- `store.svelte.ts` — 3-step wizard (config → run → done), relay lifecycle.
- route `+page.svelte` + `components/{KeysEditor,AddTokenModal}` + `$lib/ui/{Stepper,QrCanvas}` + `$lib/widgets/AddNetworkModal`.

## Universal path (non-7702) — `infra/refuel-sweep.ts`

Per EOA, strictly ordered: **refuel** (relay → EOA, shortfall only) → **tokens**
(EOA self-sends each ERC20, sequential on its own nonce) → **native last** (EOA
sweeps `balance − exact reserve` to dest, the single reclaim point so any
over-refuel flows back out). EOAs are processed in windows of `REFUEL_BATCH` (=20):
refuel the batch serial on ONE monotonic relay nonce, barrier on receipts +
balance, then drain the batch in parallel (`DRAIN_CONCURRENCY`) — sequential within
each EOA. This bounds the stranding blast radius to one batch.

Correctness invariants (all in `infra/gas.ts`, unit-tested in `gas.spec.ts`):

- **Anti-brick**: every EOA/relay tx **pins** its fee fields (`quoteFees`), so a
  base-fee spike between refuel and self-send can't make a tx overrun its budget —
  it just waits. `refuelValue()` funds `REFUEL_HEADROOM (=2)×` the worst-case cost.
- **Zero-dust reclaim**: `nativeReclaim = balF − nativeReserve(cap)`; on legacy the
  pinned `gasPrice == cap`, so `reclaim + reserve == balF` exactly. `nativeReserveWei`
  (per-network) absorbs an OP-stack L1 data fee.
- **Legacy vs 1559**: `detectFeeMode()` reads the latest block's `baseFeePerGas`
  (present → 1559, absent → legacy). `quoteFees()` builds the matching fields for
  EVERY send incl. `recoverGas` (previously hardcoded 1559 → dead on pre-London).
- **Nonce**: relay refuel/fee are serial on one seeded counter; each EOA seeds its
  nonce once and advances **only on a successful broadcast** (no gaps).
- **Fee**: a standalone relay→`FEE_COLLECTOR` tx charged after the FIRST real drain
  and awaited; if it fails the run stops (not silently skippable). Recorded at
  `index 0, count 0` so `fee-session.ts` is reused verbatim. A localStorage marker
  (`store`) survives reload → no double-charge.
- **Safe key discard**: `sweptSet` on this path is populated only from a FRESH
  post-drain `~0` balance (`drainedAddress` event), never from input membership.

Funding estimate: `estimateRefuelFundingWei` (relayer.ts) — the relay must FRONT the
refuel amounts (they flow back to dest on the sweep), so it's larger than the 7702
gas-only estimate. No contract deploys, no revoke (the Done view hides revoke on this
path). Deferred (design §9): a Disperse refuel batcher (v1.1) and a permit/Permit2
Collector (v2); v1 is the contract-free floor.

## Regenerate artifacts after a contract change

```
cd apps/biubiu-contracts && forge build && forge test --match-contract Sweeper7702Test
forge inspect src/eip7702/Sweeper7702.sol:Sweeper7702 bytecode   # → sweeper-artifact.ts
forge inspect src/eip7702/BatchSweeper.sol:BatchSweeper bytecode # → batchsweeper-artifact.ts
```
TS `predictSweeperAddress(relay)` / `predictBatchSweeperAddress()` must equal the
Foundry CREATE2 computation (same `0xff‖proxy‖salt‖keccak(initCode)` formula).
