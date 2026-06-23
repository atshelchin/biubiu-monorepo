# Wallet Sweep — Design (v2, relay-centric)

Drain native coin + selected ERC20s out of many EOAs into one destination. **No
passkey, no login, no Safe.** A throwaway **relay EOA** (which the user funds and
downloads) does all the on-chain work, via **EIP-7702**.

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

## Regenerate artifacts after a contract change

```
cd apps/biubiu-contracts && forge build && forge test --match-contract Sweeper7702Test
forge inspect src/eip7702/Sweeper7702.sol:Sweeper7702 bytecode   # → sweeper-artifact.ts
forge inspect src/eip7702/BatchSweeper.sol:BatchSweeper bytecode # → batchsweeper-artifact.ts
```
TS `predictSweeperAddress(relay)` / `predictBatchSweeperAddress()` must equal the
Foundry CREATE2 computation (same `0xff‖proxy‖salt‖keccak(initCode)` formula).
