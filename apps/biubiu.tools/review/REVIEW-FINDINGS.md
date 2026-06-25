# apps/biubiu.tools — Deep Review Findings

Generated from a 43-agent read-only review (20 areas) with adversarial verification of every P0/P1.

**Confirmed:** P0 0 · P1 7 · P2 64 · P3 79 · refuted 3


## pda-apps/balance-radar

- **Tests:** good · **Files reviewed:** 20
- Balance Radar is a client-side, no-server tool that batch-reads native/ERC20 balances for many addresses across EVM chains via Multicall3, with TaskHub-backed chunked jobs, resume, and a custom network/token store in IndexedDB. The pure logic (validate, job fan-out, networks merge, custom store) is well-factored and well-tested with vitest. However, the documented custom-network flow is broken: viem multicall can't resolve the Multicall3 address for chains not in CHAIN_MAP, so every multicall job on a user-added network fails. There is also a data-integrity issue (per-address sub-call failures are silently reported as "0" balance) and a logic bug in custom-network removal that orphans token records in IndexedDB. No real security exposure (single-user, local-only, no secrets/funds at risk).

### Findings

#### [P1] Multicall on any custom (non-CHAIN_MAP) network throws — documented BNB-Chain flow is fully broken  `bug` _(conf:high)_
- **Where:** src/lib/pda-apps/balance-radar/infra/multicall-balance.ts:56-65 (and createErc20BalanceCall 97-106); root cause src/lib/pda-apps/balance-radar/infra/networks.ts:106-115 (toViemChain)
- **What:** viem's client.multicall() resolves the Multicall3 contract address from parameters.multicallAddress OR chain.contracts.multicall3 via getChainContractAddress, which THROWS ChainDoesNotSupportContract when neither is present (verified in node_modules viem 2.46 multicall.js:55-67 + getChainContractAddress.js:3-5). The code passes neither: the contracts[] array carries the canonical 0xcA11.. per-call, but viem ignores that for resolving the aggregate target. toViemChain (networks.ts:109-114) only attaches contracts.multicall3 for chains found in CHAIN_MAP; custom chains built via defineChain get NO multicall3 (viem defineChain does not auto-add it). source.handler defaults custom networks to the multicall path (source.ts:67 useMulticall = config.hasMulticall3 !== false; custom configs never set the flag). Net effect: for a user-added network such as the BNB Chain (chainId 56) shown verbatim in CLI.md/adapters/cli.ts examples, EVERY multicall job rejects with 'ChainDoesNotSupportContract', so the user gets 0 results / all-failures on custom chains. Built-in networks are unaffected (CHAIN_MAP supplies viem chains with multicall3).
- **Fix:** Primary minimal fix — pass the already-hardcoded canonical address explicitly in both multicall calls in src/lib/pda-apps/balance-radar/infra/multicall-balance.ts:
  - createMulticallBalanceCall: client.multicall({ multicallAddress: MULTICALL3_ADDRESS, contracts: [...], allowFailure: true, batchSize: 0 })
  - createErc20BalanceCall: client.multicall({ multicallAddress: MULTICALL3_ADDRESS, contracts: [...], allowFailure: true, batchSize: 0 })
This makes viem skip the chain lookup entirely (works for built-in chains too — same canonical 0xcA11.. address). MULTICALL3_ADDRESS is already defined in that file (line 38).

Optional belt-and-suspenders: in networks.ts toViemChain (109-114) defineChain branch, add contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } } so client.chain itself advertises it. Note this address is correct on the vast majority of EVM chains (canonical deterministic deploy) but is technically an assumption; the per-call fix is preferable as the source of truth.

Add a regression test in source.spec.ts that runs handler() against a custom network with hasMulticall3 unset and asserts mc.multicall was called with multicallAddress === MULTICALL3_ADDRESS (the current direct-mock of client.multicall hides this bug, so the assertion must check the multicallAddress argument is passed, not just that multicall was invoked).

#### [P2] Per-address multicall sub-call failures are silently reported as balance '0'  `logic` _(conf:high)_
- **Where:** src/lib/pda-apps/balance-radar/infra/multicall-balance.ts:67-70 and 108-111
- **What:** With allowFailure:true, viem returns per-call {status}. The code maps any non-'success' entry to balance '0'. A transient RPC error, a reverting token contract, or a node returning a partial multicall result for a single address therefore appears in the UI/CSV as a genuine zero balance, indistinguishable from an address that truly holds nothing. For a balance-reporting / accounting tool this is a data-integrity problem: the user can silently miss funds or believe a wallet is empty. The job-level failure path (executor records failures) never fires because the chunk 'succeeded' overall.
- **Fix:** Propagate per-entry failures instead of coercing to '0'. E.g. map failed entries to a sentinel (balance:null or a status flag) and surface them as failures/'unread' in flattenJobResult (executor.ts:82-92) so the UI distinguishes 'failed to read' from 'zero'. At minimum, count and log the number of failed sub-calls per chunk so silent zeros are visible.

#### [P2] removeCustomNetwork never deletes orphaned token records from IndexedDB (re-add resurrects stale tokens)  `logic` _(conf:high)_
- **Where:** src/lib/pda-apps/balance-radar/modules/config.ts:362-368
- **What:** Line 362 sets ctx.customTokens = ctx.customTokens.filter(t => t.network !== key) FIRST, then lines 365-367 attempt 'best-effort cleanup of orphaned token records' by filtering the SAME (already-pruned) array for t.network === key — which is always empty. So deleteCustomToken is never called and the token rows for that network remain in IndexedDB. When the user later re-adds a custom network with the same chainId (same custom-<id> key), hydrateCustom (config.ts:316-322 -> getCustomTokens) reloads the stale tokens, so deleted tokens reappear and may be auto-attached to the rebuilt network.
- **Fix:** Capture the orphans before pruning: `const orphans = ctx.customTokens.filter(t => t.network === key); ctx.customTokens = ctx.customTokens.filter(t => t.network !== key); await Promise.all(orphans.map(t => deleteCustomToken(t.id).catch(() => {})));` Add a config.spec test: add network+custom token, removeCustomNetwork, then assert getCustomTokens() (with a fake IDB) is empty.

#### [P3] IndexedDB connections opened per operation and never closed  `perf` _(conf:medium)_
- **Where:** src/lib/pda-apps/balance-radar/infra/custom-store.ts:37-55 (openDB) used by every getter/setter; e.g. hydrateCustom opens two at once
- **What:** Every getCustomNetworks/getCustomTokens/save*/delete* call does indexedDB.open(...) and the resulting IDBDatabase handle is never closed. hydrateCustom does Promise.all([getCustomNetworks(), getCustomTokens()]) opening two connections simultaneously. This leaks connections for the tab lifetime and, because the connections stay open, a future DB_VERSION bump's onupgradeneeded would be blocked (versionchange) until the page reloads. Functional today (version 1) but fragile.
- **Fix:** Memoize a single shared `let dbPromise: Promise<IDBDatabase> | null` in custom-store.ts and reuse it; optionally db.onversionchange = () => db.close(). At minimum close the db in each Promise's resolve/reject.

#### [P3] Custom-network RPC URLs validated inconsistently across entry points  `bug` _(conf:medium)_
- **Where:** src/lib/pda-apps/balance-radar/schema.ts:13 vs modules/config.ts:330
- **What:** The GUI action addCustomNetwork validates rpcs with z.string().url().min(1) (config.ts:330), but the app inputSchema (schema.ts:13, networkConfigSchema.rpcs) is just z.array(z.string()) with no .url()/.min(1). So custom networks supplied via the PDA/CLI path (--custom-networks JSON) accept empty arrays or non-URL strings. An empty rpcs array makes createEVMPools build a vendor list of zero (pool with no vendors) and toViemChain's rpcUrls.default.http = []; jobs then fail opaquely. Not a security issue (single-user, user supplies own RPCs) but a robustness gap.
- **Fix:** Tighten networkConfigSchema.rpcs to z.array(z.string().url()).min(1) in schema.ts so both GUI and CLI inputs are validated identically; add a validate() guard that drops/throws on custom networks with no usable RPCs.

#### [P3] fetchTokenMetadata does not validate the contract address before an RPC read  `bug` _(conf:medium)_
- **Where:** src/lib/pda-apps/balance-radar/modules/config.ts:374-392
- **What:** addCustomToken validates address with /^0x[a-fA-F0-9]{40}$/ (config.ts:398) but fetchTokenMetadata (used to auto-fill symbol/decimals) takes input.address: z.string() with no format check and passes it straight to createTokenMetadataCall -> readContract({address: input.address as Address}). A malformed address makes viem throw InvalidAddressError, which rejects the action; if the UI doesn't catch it the error only lands in the console (UI-DESIGN-RULES: surface errors in UI). Low impact, local-only.
- **Fix:** Reuse the same address regex on fetchTokenMetadata.input.address, and ensure the SvelteKit UI surfaces the rejected promise as an inline alert.

#### [P3] EVMVendor recreates a viem PublicClient on every call  `perf` _(conf:low)_
- **Where:** src/lib/evm/evm-vendor.ts:20-26
- **What:** execute() calls createPublicClient(...) for every EVMCall. In a large run (e.g. 100k addresses -> hundreds of chunked jobs, plus the per-address fallback loop for non-Multicall3 chains issuing one call per address) this instantiates a fresh client+transport per call. viem clients are lightweight, so impact is modest, but on the individual-fallback path (source.ts:81-89) it is one client per address. Caching the client per (rpcUrl, chain) would cut allocation.
- **Fix:** Lazily build and cache the PublicClient in the EVMVendor instance (it already holds rpcUrl + chain) instead of per execute().

### Dead code
- RunResult.duration is computed (executor.ts:325) but formatOutput pulls duration from stats; both paths used, not dead. No dead exports found — networks.ts CHAIN_MAP/PRESET_TOKENS/customNetworkKey/toViemChain all consumed.
- schema.ts networkConfigSchema.hasMulticall3 (line 16) is accepted on input but the executor/source default custom networks to the multicall path regardless (source.ts:67 only honors an explicit false); no UI/CLI path ever sets it true, so it is effectively inert for the broken custom-multicall case (see P1 finding).

### Duplication
- Input type (executor.ts:21-26) and PDAInput type (modules/execution.ts:36-41) are byte-for-byte identical {addresses, networks, tokenSelections?, customNetworks?}. Extract one shared type (e.g. in types.ts) and import in both.
- The 'run' action input schema (modules/execution.ts:76-89) re-declares the entire app inputSchema (schema.ts:19-38) by re-importing tokenSpecSchema/networkConfigSchema and rebuilding the same object. Reuse the exported inputSchema instead of duplicating it.
- Native vs ERC20 / multicall vs individual branching exists twice: source.handler (source.ts:70-90) chooses among the four create*Call factories. Acceptable, but the success?->toString():'0' mapping is copy-pasted in createMulticallBalanceCall (multicall-balance.ts:67-70) and createErc20BalanceCall (108-111); extract a mapResults(addresses, results) helper.


## pda-apps/event-scanner

- **Tests:** partial · **Files reviewed:** 23
- Block-range event scanner: builds deterministic TaskHub jobs (filterSets × chunked sub-ranges), scans eth_getLogs through a failover vendor pool with adaptive per-call shrinking, dedups/decodes into IndexedDB, and tracks unservable block ranges as auditable "gaps" with a fillGaps recovery path. The infra helpers (range arithmetic, error classification, adaptive split, time→block) are well-factored and unit-tested. However, the resume + completeness state machine — the part that matters most for a tax/accounting tool where missing data is the worst outcome — has correctness holes: a terminally-failed job (e.g. 3× JOB_TIMEOUT on a slow/dead RPC over a dense range) becomes a silent, permanent data hole that is NOT recorded in gaps, NOT retried by Resume, and NOT recoverable by fillGaps, while still counting toward "scanned" so the scan reads as complete. Resume is also effectively unavailable for the default "last N days" path due to a non-deterministic scanId. Overall health: solid plumbing, but the headline guarantee (provable completeness + resumability) is not actually upheld in the failure paths, none of which are tested.

### Findings

#### [P1] Terminally-failed job = silent permanent data hole (not a gap, not resumable, not fillable) yet scan reads as complete  `logic` _(conf:high)_
- **Where:** executor.ts:278-285, 349-365
- **What:** When a TaskHub job exhausts its 3 retries (e.g. JOB_TIMEOUT=180s repeatedly on a slow/range-limited RPC over a dense chunk — very reachable since the adaptive layer can spend >180s skipping a dead range block-by-block), the dispatcher emits job:failed terminally. The executor's job:failed handler ONLY does `scannedBlocks += job.input.toBlock - job.input.fromBlock + 1` and logs a warning. It does NOT add the failed range to any gap list. `source.skippedRanges` is populated solely by the in-handler adaptive onBlocksSkipped callback (per-block skips inside a surviving job) — a whole job that throws never reaches that callback. Consequences: (1) the failed range is absent from `gaps`, so fillGaps (which reads only meta.gaps) can never recover it; (2) because scannedBlocks was incremented, `fullyProcessed = scannedBlocks >= totalBlocks` can become true → lastScannedBlock=toBlock → the scan reads as COMPLETE with zero gaps; (3) on a fresh-page Resume the task status is `completed` (any completed job makes status completed even with failed jobs, see Task.start counts logic), so Task.resume() no-ops and the failed jobs are never retried. Net: missing event data presented as a complete, gap-free scan — the exact failure mode this tool's gap-auditing was built to prevent.
- **Fix:** Root cause: the job:failed handler treats a terminally-failed job's range as "covered" (adds it to scannedBlocks) while contributing nothing to the gap list, so the failed range is simultaneously (a) counted toward fullyProcessed and (b) absent from gaps. Fix both halves.

Minimal fix in executor.ts run():

1) Capture failed ranges. Near `const seen = ...` (line 215) add:
   const failedRanges: BlockRange[] = [];   // BlockRange already imported (line 26)

2) In the job:failed handler (lines 278-285), record the range and do NOT count it as covered. Replace the `scannedBlocks += ...` line with a push:
   task.on('job:failed', (job, error) => {
     failedRanges.push([job.input.fromBlock, job.input.toBlock]);
     ctx.info(`Failed blocks ${job.input.fromBlock}–${job.input.toBlock}: ${error.message}`, 'warning');
     ctx.progress(Math.min(scannedBlocks, totalBlocks), totalBlocks, '');
   });
   (Dropping the scannedBlocks increment is required so fullyProcessed reflects truly-covered blocks. Keeping it would re-introduce the false "complete" even with the gap recorded.)

3) Include failed ranges in persisted gaps (line 353):
   const gaps = mergeRanges([...(existingMeta?.gaps ?? []), ...source.skippedRanges, ...failedRanges]);

4) Make fullyProcessed gap-aware so a recorded gap forces the scan to read as incomplete. Since totalBlocks is multiplied by filterSets.length but gaps are per-block, gate on both: never claim full coverage while any gap exists. Replace line 358:
   const fullyProcessed = scannedBlocks >= totalBlocks && gaps.length === 0;

With this, a terminal failure → gap persisted → fillGaps can re-scan it (fillGaps re-queries every filterSet over each gap, so the per-block-vs-per-filterSet asymmetry is handled there), the green "Complete" badge is withheld (gaps.length>0 → warn branch with "Re-scan gaps"), and lastScannedBlock stays behind so the Resume banner also reappears as a backstop.

Optional hardening (separate from this finding): the underlying TaskHub semantics make any terminally-failed job permanently unretryable on resume (status stays 'completed'; resetFailedJobs never called). Consider calling hub.resetFailedJobs(existing.id) before resumeTask, or treating 'completed-with-failures' specially, so a normal Resume can also retry failed chunks — but the gap-capture fix above is sufficient to close the silent-data-hole correctness bug because fillGaps becomes a working recovery path.

#### [P2] Resume can never match for the default "last N days" / date range — scanId is non-deterministic  `logic` _(conf:high)_
- **Where:** executor.ts:129-150,167-179; modules/config.ts:646-667
- **What:** The scanId is the merkle root of the job set, and jobs are built from concrete fromBlock/toBlock. For the lastNDays/dates paths the config module sends `range` (NOT concrete blocks; see config.ts:664-666), so the executor resolves blocks via resolveBlockRange using Date.now() and the current chain head every run (executor.ts:136-148). A re-run a minute later yields a different toBlock (=latest) and usually a different fromBlock → a different scanId → findTaskByMerkleRoot never matches → no resume, and events land under a brand-new scanId (pk includes scanId so prior events aren't even deduped against). The executor comment at line 129 ('UI usually passes concrete blocks for a stable scanId') is false for the default rangeKind ('lastNDays', config.ts:212). So the headline 'resumable indexing / never lose a long scan' silently does not apply to the most common range selection.
- **Fix:** Resolve the date/relative range to concrete blocks in the config module BEFORE submitting (so the saved input carries fromBlock/toBlock and a stable scanId), or snap the resolved range deterministically (e.g. floor toBlock to a fixed cadence and derive fromBlock from it) so the same logical selection maps to the same blocks within a session. Simplest: in config, call resolveBlockRange when building the input and pass concrete fromBlock/toBlock for all rangeKinds.

#### [P2] fullyProcessed completeness flag can be true while real gaps exist  `logic` _(conf:high)_
- **Where:** executor.ts:358-362
- **What:** `fullyProcessed = scannedBlocks >= totalBlocks` is used to decide whether to advance lastScannedBlock to toBlock (i.e. mark the historical range fully covered). But scannedBlocks is incremented for BOTH completed jobs (ingest) AND failed jobs (job:failed handler) AND in-handler per-block skips are NOT subtracted. So a run that produced gaps (skips) or failed jobs still reaches scannedBlocks==totalBlocks and sets lastScannedBlock=toBlock. The JSON export's `complete` flag (execution.ts:259-260) is `gaps.length===0 && lastScannedBlock>=toBlock`; the gaps guard saves it for skip-gaps, but the failed-job case (finding #1) has empty gaps AND lastScannedBlock=toBlock → exported as complete. Even ignoring failures, basing 'fully covered' on a counter that includes un-served blocks is fragile.
- **Fix:** Compute coverage from actual covered blocks, not an attempt counter: fullyProcessed should be `(totalBlocks - blocksInGaps - failedBlocks) >= totalBlocks` i.e. gaps/failures empty. Drive lastScannedBlock/complete off the gap+failed set rather than scannedBlocks.

#### [P2] Live-tail reorged/orphaned events are never removed (permanent stale rows)  `logic` _(conf:medium)_
- **Where:** infra/live-tail.ts:40-107; types.ts:67-68
- **What:** Live-tail seeds cursor from getMaxScannedBlock (highest block that has a stored event) and only ever upserts by pk=scanId:txHash:logIndex. If a reorg occurs deeper than `confirmations` (default 3), or replaces a tx, the orphaned log's pk differs from the canonical-chain log's pk, so the old row is never deleted — both the orphaned and the new event persist, double-counting for accounting. Additionally, if a scan has zero matching events, getMaxScannedBlock returns null and cursor falls back to fromBlockFallback(=toBlock)+1, which is correct, but if events are sparse the cursor can sit behind the truly-scanned head and re-scan ranges every tick (harmless due to dedup, just wasted RPC). The reorg double-count is the real risk for a tax tool.
- **Fix:** Either raise the default confirmations to a chain-appropriate safety depth and document the reorg assumption, or on each tick delete stored events in the (cursor-overlap) window before re-inserting, so a reorg within the re-scanned span self-heals. At minimum surface in the UI that live-tail does not handle deep reorgs.

#### [P3] Self-transfer collapses in/out filter sets (one direction lost) due to shared pk  `logic` _(conf:medium)_
- **Where:** infra/decode.ts:64; executor.ts:248-257
- **What:** For wallet-track, the 'out' set matches topic1=wallet and 'in' set matches topic2=wallet. A self-transfer (from==to==wallet) matches BOTH sets, producing two DecodedEvent rows with identical pk=scanId:txHash:logIndex but different filterSetId. The second putEvents upsert overwrites the first, so only one direction survives, and the in-memory `seen` set counts it once. Minor for typical wallets but mislabels self-transfers.
- **Fix:** Include filterSetId in the pk (e.g. `${scanId}:${filterSetId}:${txHash}:${logIndex}`) if both directions should be retained, or explicitly document/handle self-transfers as a single 'self' direction.

#### [P3] Resume replay re-writes ALL prior events and grows pendingWrites unbounded  `perf` _(conf:medium)_
- **Where:** executor.ts:218,257,267-274,342
- **What:** On resume, the replay loop iterates every completed job and calls ingest → putEvents for each job's decoded logs (re-persisting the entire already-stored event set, idempotent but full I/O). Every putEvents promise is also pushed into pendingWrites, which is awaited only at the very end (Promise.allSettled) and so holds one promise per logs-bearing job for the whole scan — unbounded memory for very large scans. countEvents already makes IndexedDB authoritative, so the replay's re-write is redundant for the count.
- **Fix:** On resume, seed eventCount from countEvents(scanId) and skip re-writing during replay (only re-derive the in-memory `seen`/count, not putEvents). Bound pendingWrites by awaiting in batches or rely on event-store's internal writeQueue serialization and only await a final flush.

#### [P3] Bundled Etherscan API key shipped in client source  `security` _(conf:high)_
- **Where:** infra/abi-fetch.ts:18
- **What:** DEFAULT_ETHERSCAN_KEY is a hardcoded shared Etherscan V2 key embedded in client-shipped code (also referenced in abi-resolve.ts). Anyone can extract and abuse it, exhausting/blocking the project's rate limit for all users. This is a known/intentional convenience key (same as the deployer), and ABI fetch is non-critical (user can paste ABI / supply own key), so impact is availability of auto-fetch, not funds/keys. Flagging per launch-audit 'secrets in code'.
- **Fix:** Accept the tradeoff explicitly, or proxy Etherscan calls through a server route that holds the key, or rate-limit/rotate. At minimum keep the user-key override path (already present) prominent so power users don't depend on the shared key.

#### [P3] Resume / gap-on-failure / completeness / live-tail / fillGaps state machine is entirely untested  `test-gap` _(conf:high)_
- **Where:** event-scanner.spec.ts (whole)
- **What:** Tests cover only pure helpers: error classification, topic encoding, decode, adaptive-chunk happy path, ranges arithmetic, and time-to-block estimate. The highest-risk, correctness-critical paths have zero coverage: executor resume (replay + double-count avoidance), gap persistence when a job terminally fails (finding #1), fullyProcessed/lastScannedBlock completeness (finding #3), the rate-limit interrupt/abort loop, live-tail reorg/seed behavior (finding #4), and fillGaps. These are exactly the paths where the tool's completeness/resumability guarantees live.
- **Fix:** Add executor-level tests with a fake TaskHub source / in-memory storage covering: (a) a job that throws → its range appears in persisted gaps and scan is not marked complete; (b) resume re-ingests without inflating eventCount; (c) fillGaps shrinks gaps and is idempotent; (d) a lastNDays input produces a stable scanId (after fixing #2).

### Dead code
- subtractRanges (infra/ranges.ts:30) — exported and unit-tested but never called by any production code path; the gap-recovery in fillGaps recomputes remaining gaps via mergeRanges(stillSkipped) instead. Either wire it in or drop it.
- EventLogSource.skippedCount getter (infra/log-source.ts:43-45) — computed from this.skips but never read anywhere (executor uses skippedRanges + ranges.totalBlocks). Dead.
- getlogs-call.ts:24,49-50 transactionIndex is parsed and carried through RawLog (types.ts:57) but DecodedEvent (types.ts:66-79) never stores it and no consumer reads it — dead field threaded through decode.

### Duplication
- sleep-with-abort helper is defined twice with identical body: adaptive-chunk.ts:45-53 and live-tail.ts:46-57. Extract one shared abortableSleep(ms, signal).
- ABI fetch+merge logic is duplicated between modules/config.ts:447-465 (detectProxy action: loop facets → fetchAbi → mergeAbis) and infra/abi-resolve.ts:99-117 (resolveContractFull: same loop → fetchAbi → mergeAbi). Two mergeAbi implementations also exist (abi-resolve.ts:32 mergeAbi vs config.ts mergeAbis). Consolidate proxy-ABI merge into abi-resolve and have config call it.
- Block-range-to-scannedBlocks accounting `to - from + 1` is repeated in ingest (executor.ts:247), job:failed (executor.ts:279), and fillGaps (executor.ts:453); fine as-is but the failed-vs-completed accounting divergence is the root of finding #1.


## pda-apps/forever

- **Tests:** partial · **Files reviewed:** 17
- Forever ("致未来 · Forever") is an on-chain time-capsule app: notes are AES-GCM-256 encrypted under a deterministic content key derived from the wallet passkey's WebAuthn PRF (HKDF-SHA256), optionally time-locked with drand-quicknet tlock (tlock OUTSIDE, AES INSIDE), and stored as `bytes` payloads on a per-chain Forever contract written via the passkey-Safe ERC-4337 path. The live crypto path is sound: the drand group public key is pinned (preventing forged-beacon early opens), GCM tags authenticate payloads, the key is memory-only by design, and PRF is correctly pinned to the wallet credential. Overall health is good, but there is a real key-material-disclosure issue via a leftover, ungated developer route, a meaningful chunk of dead legacy-envelope code, and a couple of state-machine/UX edge bugs. Test coverage exercises the crypto primitives and the live tlock round-trip but does not cover the store/state machine at all.

### Findings

#### [P2] unlock() coalescing guard is independent of the busy/status guard; deriveKey() unconditionally resets status='idle' even when run as a sub-step of seal()  `logic` _(conf:medium)_
- **Where:** src/lib/pda-apps/forever/store.svelte.ts:195-228,242-255,258-280
- **What:** setupKey()/seal() use `if (this.busy) return false` (busy = status in setup/unlocking/sealing) as the re-entry guard, but unlock() uses a SEPARATE unlockPromise coalescer. seal() sets status='sealing', then `await this.unlock()`; unlock→deriveKey sets status='idle' on success (line 249), and seal re-asserts 'sealing' at line 280. The two unrelated guards must stay consistent, and deriveKey hard-setting 'idle' as a sub-step means any failure between unlock resolving and line 280 leaves the status machine flapping idle→sealing. Not user-exploitable (single-threaded between awaits) but a fragile state-machine design that contradicts the project's 'state machine, not ad-hoc flags' guidance.
- **Fix:** Have deriveKey()/unlock() restore the PRIOR status (or take a flag) when invoked as a sub-step of seal()/loadEntries() instead of hard-setting 'idle', so the top-level status is owned by one place.

#### [P2] Auto-reload throttle (lastAutoReload) is not reset on chain switch, can suppress the first auto-open of a matured capsule after re-entering a chain  `bug` _(conf:medium)_
- **Where:** src/routes/apps/forever/+page.svelte:73-80 (with store.enterChain store.svelte.ts:430-441)
- **What:** `lastAutoReload` is a plain page-local `let`. When a capsule matures the effect reloads at most once / 15s. On exitChain→enterChain the entries are cleared but lastAutoReload keeps its timestamp; if `now - lastAutoReload < 15` on the newly-entered chain, a capsule that is already matured there won't auto-open until the 15s window elapses. Minor UX staleness; self-heals on the next tick or a manual refresh.
- **Fix:** Reset lastAutoReload=0 when store.networkSlug changes (a $effect keyed on store.networkSlug, or set it in store.enterChain).

#### [P2] seal() balance preflight conflates 'can pay protocol fee' with 'can pay fee + gas', giving false confidence on under-funded Safes  `logic` _(conf:medium)_
- **Where:** src/lib/pda-apps/forever/store.svelte.ts:283-288
- **What:** Preflight does `if (BigInt(balHex) < FEE_WEI) fail(...)`. The Safe must pay FEE_WEI PLUS 4337 gas (unless a bundler gas account/sponsor covers it). A Safe holding exactly FEE_WEI passes preflight then fails at the bundler, so the friendly early-out doesn't actually reflect spendability. The check is also best-effort (catch swallows). Net effect: a worse error path than intended in the exact case the preflight was meant to catch.
- **Fix:** Either drop the redundant preflight (the bundler already returns precise AA21/gas-account errors handled by friendlyError) or compare against FEE_WEI plus a small gas reserve so the early-out means 'fee + gas'.

#### [P3] Single deterministic DEK reused for AES-GCM across every note forever with random 96-bit IVs — safe only because of the on-chain 1-note/day cooldown (undocumented invariant)  `security` _(conf:medium)_
- **Where:** src/lib/pda-apps/forever/crypto/core.ts:81-88 + crypto/envelope.ts:31-33,68-72
- **What:** deriveContentKey yields ONE key for all notes on all chains for the life of the passkey; aesSeal uses a random 12-byte IV per note. AES-GCM with random 96-bit IVs has a birthday bound (~2^32 messages) before IV-collision probability matters. The contract's 24h/author cooldown caps practical lifetime notes far below that, so it is safe in practice — but the safety depends entirely on an off-file invariant. If the cooldown is removed/lowered or a bulk path is added, IV reuse under a fixed key catastrophically breaks GCM confidentiality and integrity.
- **Fix:** Document the dependency on the on-chain cooldown for IV-uniqueness in core.ts/envelope.ts, OR derive a per-note subkey (HKDF info including createdAt||chainId) so the IV space is per-key and the global bound disappears.

#### [P3] evaluatePrf returns the asserted credentialId but deriveKey never verifies it equals the requested wallet credential (defense-in-depth gap)  `security` _(conf:medium)_
- **Where:** src/lib/pda-apps/forever/crypto/prf.ts:74-102 + store.svelte.ts:242-255
- **What:** evaluatePrf(cred) pins allowCredentials to the wallet credentialId (good) and returns {prf, credentialId}, but deriveKey() destructures only `prf` and ignores the returned id. With allowCredentials set this is low-risk, but the id exists precisely to be checked; if a future change ever enables the discoverable path (cred undefined → allowCredentials []), the key would silently fork to whatever passkey the user picks with no guard — exactly the 'divergent key makes letters undecryptable' failure the code elsewhere warns about.
- **Fix:** In deriveKey(), assert returned credentialId === cred.credentialId before accepting the key; throw noPrf otherwise.

#### [P3] Store/state-machine (the security-critical orchestration) has zero tests; capsule.spec.ts depends on the live drand network; envelope.spec.ts tests dead code  `test-gap` _(conf:high)_
- **Where:** src/lib/pda-apps/forever/store.svelte.ts (no test); crypto/capsule.spec.ts:8-20; crypto/envelope.spec.ts
- **What:** All specs cover pure crypto primitives + the offline reader decode. The store — which decides private-vs-capsule layering, cooldown gating, unlock coalescing, fee preflight, error mapping, and the tlock/AES ordering on the WRITE path — is untested. capsule.spec.ts hits api.drand.sh over the real network (30s timeout), so it is flaky/offline-failing in CI and is the only test proving the live timelock layering. envelope.spec.ts thoroughly tests the legacy envelope code that is no longer used.
- **Fix:** Add store.seal() layering unit tests (mock sendContractCall/rpcCall/timelockSeal): private→plain AES payload; capsule→tlock(AES) with correct round/unlockAt/beaconScheme; cooldown + over-limit rejection. Mock the drand client in capsule.spec.ts (or mark it integration-only). Delete envelope.spec.ts when the legacy envelope code is removed.

#### [P3] Persisted credential (LS_CRED) and hasKey are vestigial after pinning PRF to the wallet passkey  `dead-code` _(conf:medium)_
- **Where:** src/lib/pda-apps/forever/store.svelte.ts:45,99-101,115-117,149-152,242-255
- **What:** The store loads/saves `credential` to localStorage and exposes hasKey, but the live path ALWAYS targets the wallet credential via credentialFor(user) (the comment at _unlock explicitly warns a stored credential could be a divergent legacy encryption passkey). So credential/persist()/hasKey no longer influence which passkey is used — they only feed the onboarding step2 hint. Leftover coupling from the abandoned dedicated-encryption-passkey scheme.
- **Fix:** Remove credential persistence and derive hasKey from authStore.user presence (or drop hasKey's dependence on credential), eliminating LS_CRED and persist().

### Dead code
- crypto/envelope.ts:35-65 — legacy wrapped-DEK scheme (deriveKEK, createEnvelope, wrapDek, openEnvelope, NewKey interface, KEK_SALT/KEK_INFO/ENVELOPE_VERSION constants) is used ONLY by envelope.spec.ts; the live store path uses deriveContentKey + encrypt/decryptContent exclusively. The file's own header admits it's 'tests only'.
- crypto/prf.ts:21-67 — createEncryptionPasskey + EncryptionCredential is never called anywhere (grep shows only the doc comment); it's dead. The RP_NAME constant is only used by it.
- contract/reader.ts:88-91 — fetchKeys() (getKeys view) has no caller outside abi; the on-chain key/envelope scheme was abandoned for deterministic PRF keys.
- contract/encode.ts:35-42 — encodeSetKey() and payloadToBytes() have no callers (setKey path abandoned; payload→bytes done inline via hexToBytes in reader.toEntry).
- contract/abi.ts:31-34,66-79,98-105 — setKey, keyCount, getKeys functions and the KeyAdded event in FOREVER_ABI are never invoked by the client.
- store.svelte.ts:45,99-101,149-152 — credential is loaded/persisted (LS_CRED) but the live path always re-derives from authStore.user via credentialFor(); the stored credential is deliberately never used to target PRF, making the persisted credential + hasKey getter largely vestigial.

### Duplication
- PRF salt string 'forever.biubiu.tools/prf/v1' is duplicated in crypto/prf.ts:14 and routes/forever-prf-test/+page.svelte:15 (and the b64url/hex helpers in the test route duplicate $lib/auth/crypto-utils + crypto/core). The duplicated salt is what makes the dev route derive the SAME live encryption root — see the security finding.
- contract/address.ts:14 DRAND_QUICKNET_HASH ('0x52db9b…') duplicates crypto/timelock.ts:15-17 QUICKNET_HASH/QUICKNET_BEACON_SCHEME. address.ts's copy has no caller — single-source it in timelock.ts.
- store.byteLength (store.svelte.ts:129) recomputes UTF-8 byte length via new TextEncoder().encode(...).length; minor and benign but repeated per render.


## pda-apps/token-sender

- **Tests:** partial · **Files reviewed:** 18
- Batch token sender built on Safe MultiSend 1.4.1 via the unified ConnectedWallet abstraction; each batch is one atomic sendCalls (MultiSend delegatecall for biubiu, wallet_sendCalls atomicRequired for external). Core logic (parse, fee ladder, multisend encoding, orchestrator) is well-factored, has good unit tests, and the fund-safety primitives (per-batch atomic fee+transfers, resume-skip of completed batches, balance preflight) are sound. Overall health is good. The real gaps: the fee is charged PER BATCH but several comments/docs claim it is charged once "with the first batch" (misleading, and the per-batch reality is a meaningful cost surprise for large sends), the resume/send/persistHistory store path that guards against double-payouts is entirely untested, and a few edge cases (equal-mode rounding to zero, fee rounding down) are minor.

### Findings

#### [P1] Resume / double-payout guard and persistHistory status logic are entirely untested  `test-gap` _(conf:high)_
- **Where:** src/lib/pda-apps/token-sender/store.svelte.ts:304-345,347-395 and orchestrator.ts:143 (completedBatchIndices)
- **What:** The single most fund-critical behavior — resume must skip already-completed batches so already-paid recipients are NOT paid again and the per-batch fee is not re-charged for them — has no test. orchestrator.spec.ts covers planBatches/preflight/runSend success/skip/abort/pre-abort, but NEVER passes completedBatchIndices, so the resume-skip branch (orchestrator.ts:143) is uncovered. The store has no spec file at all, so send()/resume()/persistHistory() (status='completed'|'partial'|'failed' derivation, sentCount accumulation, record id reuse via sendStartedAt) are unverified. A regression that drops the completedBatchIndices check would double-send funds and no test would catch it.
- **Fix:** Two minimal tests, both pure (mock SafeSenderWallet, no chain), runnable under the existing vitest setup.

1) Orchestrator resume-skip test (add to core/orchestrator.spec.ts, reusing existing mockWallet/recips helpers):
   - Run runSend with 4 batches (recips(8), batchSize 2), a non-zero fee, and completedBatchIndices = new Set([0, 2]).
   - Capture the per-call batchIndex inside the sendBatch mock.
   - Assert wallet.sendBatch is called exactly twice and only for batchIndex 1 and 3 (out.results.map(r=>r.batchIndex) === [1,3]).
   - Assert each of those two calls still includes the fee sub as calls[0] (value === fee.amount, data === '0x') to lock in per-batch fee on resumed batches.
   - Also assert the skipped batches do NOT consume the inter-batch delay incorrectly (optional).

2) Store-level resume test (new file store.svelte.spec.ts):
   - Mock walletStore.activeWallet, createConnectedWallet, quoteFee, putSend/listSends, and FEE_COLLECTOR so send()/resume() run offline.
   - Seed parsed with N recipients spanning >=3 batches; make the wallet fail the 2nd batch on first send() (skip policy). Assert execStatus==='done', results has the succeeded batches, failures has batchIndex 1, and the persisted SendRecord.status==='partial' with totalRecipients===sum of successCount.
   - Then call resume(): assert sendBatch is NOT invoked for the already-succeeded batchIndices (completed set derived from this.results), only the previously-failed/remaining ones are retried, and on full success the persisted record reuses the same id (`send-${sendStartedAt}`) with status flipping to 'completed' and sentCount reflecting all recipients.
   - Cover the status matrix directly: all-fail → 'failed', all-pass → 'completed', mixed → 'partial'.

Root cause is purely a missing-test gap; no production code change is needed. The fix is adding the two regression tests above so any future removal/weakening of orchestrator.ts:143 (the completedBatchIndices skip) or mis-derivation in persistHistory fails CI.

#### [P2] interBatchDelayMs starts AFTER a resumed batch instead of before the first re-sent batch, and abort-during-delay path is untested  `logic` _(conf:medium)_
- **Where:** src/lib/pda-apps/token-sender/core/orchestrator.ts:146-152
- **What:** The inter-batch delay is gated on `results.length > 0`. In a resume run, results starts empty (resume does not seed results into runSend; it only passes completedBatchIndices), so the FIRST remaining batch sends immediately with no breathing gap — which is the desired anti-popup-storm behavior anyway, so this is benign. The real gap: abortableDelay (orchestrator.ts:116-127) and the abort-during-delay break (148-151) have NO test. The CLAUDE.md Promise.race/timer lessons apply here — abortableDelay correctly clears the timeout and removes the listener on both paths, so it is leak-free, but an untested abort-mid-delay could regress into a hang or a missed abort.
- **Fix:** Add a fake-timers test: start runSend with interBatchDelayMs>0, abort() during the delay between batch 1 and 2, and assert the run returns aborted=true having sent exactly 1 batch and not leaking a pending timer.

#### [P2] equal-mode integer division can assign amount=0n to recipients, producing zero-value transfers that still cost gas + fee  `logic` _(conf:medium)_
- **Where:** src/lib/pda-apps/token-sender/core/parse.ts:94-98
- **What:** In equal mode, `per = total / BigInt(recipients.length)`. If total < recipients.length (e.g. total=2 wei across 5 recipients, or a low-decimals token), per=0n and dust=total all goes to recipient[0]; recipients[1..n] get amount=0n. canProceedFromRecipients (store:154-156) only checks totalAmount>0n (true, because dust on first), so the send proceeds and emits native value-0 / ERC20 transfer(_,0) sub-transactions for the zero recipients — wasting gas and (if non-member) still paying the per-batch fee for batches that move nothing meaningful. Not a loss of user funds beyond gas/fee, but a silent footgun.
- **Fix:** In equal mode, after redistribution, treat per===0n as invalid: either reject with a parse error ('amount-too-small-for-recipient-count') or filter out 0n recipients. Add a unit test for total < recipientCount.

#### [P3] USD fee rounds DOWN via toFixed(decimals), slightly undercharging at 18-decimal precision  `logic` _(conf:high)_
- **Where:** src/lib/pda-apps/token-sender/core/fee.ts:28
- **What:** `native.toFixed(network.decimals)` with decimals=18 stringifies a JS double to 18 fractional digits, but a double only has ~15-17 significant digits, so the low-order digits are noise and the value is truncated, not rounded. The collected fee can be marginally below the $5 target (sub-wei to a few wei of native). Economically negligible (fractions of a cent), and it never OVERcharges, so no user harm — noted only for completeness.
- **Fix:** Acceptable as-is. If exactness ever matters, compute fee in integer wei directly: amount = (BigInt(round(FEE_USD * 1e8)) * 10n**decimals) / BigInt(round(price * 1e8)) to avoid float toFixed truncation.

#### [P3] loadTokenMeta has no in-flight guard / staleness check — rapid token-address edits can apply a stale result  `logic` _(conf:medium)_
- **Where:** src/lib/pda-apps/token-sender/store.svelte.ts:176-200
- **What:** loadTokenMeta is async (RPC reads symbol+decimals). If the user edits tokenAddress and triggers it twice quickly, two requests race; the later-resolving one wins regardless of which address it was for, so tokenMeta/decimals could reflect a previous token address. Because parse() uses this.decimals, a stale decimals would mis-scale parsed amounts. In practice the UI debounces/loads on blur so the window is small, but there is no request-token guard (cf. CLAUDE.md 'thread-safe init' / stale-async lessons).
- **Fix:** Capture the trimmed address at call start and bail before assigning if this.tokenAddress.trim() !== captured (or use a monotonically increasing request id and ignore non-latest responses).

#### [P3] Custom network slug collides across different chains with the same chainId, silently overwriting RPC/explorer  `logic` _(conf:low)_
- **Where:** src/lib/pda-apps/token-sender/store.svelte.ts:424,438
- **What:** addCustomNetwork derives slug=`custom-${chainId}` and dedupes by slug (filter n.slug !== slug). Two different custom networks that happen to share a chainId (e.g. a fork/L3 reusing an id, or re-adding with a different RPC) collapse to one entry — the second add overwrites the first's name/rpc/explorer. Low impact (custom chains can't send anyway, sendSupported=false), but the persisted IndexedDB record is also keyed by slug so the overwrite is durable.
- **Fix:** Either key custom networks by chainId+name (or a uuid) instead of chainId alone, or surface a confirm/merge when a custom slug already exists.

#### [P3] ERC20 address regex re-implements viem isAddress already used elsewhere  `duplication` _(conf:low)_
- **Where:** src/lib/pda-apps/token-sender/store.svelte.ts:183
- **What:** loadTokenMeta validates the token address with /^0x[a-fA-F0-9]{40}$/, while parse.ts:49 uses viem's isAddress for recipient addresses. Two different validators for the same concept; the regex accepts non-checksummed mixed-case strings that isAddress would also accept (so behavior is close) but the inconsistency invites drift and the regex misses viem's normalization.
- **Fix:** Use isAddress(addr) from viem in loadTokenMeta for consistency, then pass getAddress(addr) downstream.

### Dead code
- batchNativeOutflow (src/lib/pda-apps/token-sender/infra/multisend.ts:83) is exported and only referenced from multisend.spec.ts — no production caller (orchestrator/preflight compute native need from totalAmount+fee directly, not from subs). Either wire it into preflight as the source of truth for native outflow, or drop it.
- BATCH_TOP_VALUE (src/lib/pda-apps/token-sender/infra/multisend.ts:29) is exported but never imported anywhere (no spec, no caller). Dead constant — remove.
- encodeMultiSend (src/lib/pda-apps/token-sender/infra/multisend.ts:41) is exported and exercised by multisend.spec.ts but has no production caller: the actual send path passes raw SubTransaction[] to wallet.sendCalls and lets the wallet backend do the MultiSend/5792 batching, so encodeMultiSend's packed bytes are never used in app flow. It is only meaningful for a future 'export Safe batch' feature; if that is not imminent, it (and encodeSubTransaction) is speculative.
- getSend / deleteSend (src/lib/pda-apps/token-sender/history/send-history.ts:57,68) are exported but never called from the store or any app code (only the spec calls them). No UI deletes or fetches a single record. Dead until a history-management UI exists.

### Duplication
- RPC public-client construction is duplicated: core/wallet.ts:35-40 (clientFor) and core/price.ts:36 both build `createPublicClient({ transport: fallback(resolveRpcUrls(chainId, rpcs).map(http)) })`. Extract one helper (e.g. publicClientFor(network)) and reuse in both.
- runSend invocation is near-identical in store.svelte.ts send() (lines 261-284) and resume() (lines 317-341): same deps object, same onProgress/onBatchDone/onBatchFailed callbacks, only completedBatchIndices and the results-reset differ. Extract a private runWithCallbacks(extra) to remove the ~25-line copy and the risk of the two drifting (e.g. send() resets this.results but resume() does not — easy to get wrong when editing one).
- The ERC20 address-shape regex /^0x[a-fA-F0-9]{40}$/ in store.svelte.ts:183 duplicates viem's isAddress already used in parse.ts:49; use isAddress for consistency (it also does checksum-aware validation).


## pda-apps/nft-multisender + token-multisender

- **Tests:** partial · **Files reviewed:** 16
- Two batch-distribution PDA apps (ERC721/1155 NFTs; native/ERC20 tokens) built on TaskHub with a clean validate -> chunk -> run-with-interrupt-queue pipeline and good unit tests for the pure helpers (parseRecipients/validate/formatOutput). However both apps are unfinished scaffolding: neither is wired into any route, adapter, CLI, or i18n; the app factories (createNftMultisenderApp/createTokenMultisenderApp) are never called anywhere in the monorepo; and every distribution contract address in networks.ts is the zero-address PLACEHOLDER. More seriously, the on-chain side is broken/misleading: the client ABIs omit the trailing PayInfo `pay` parameter (and protocol fee) that the deployed contracts require -> selector mismatch -> every tx reverts; and the handlers never decode the contract's partial-failure result, so silently-skipped recipients are reported to the user as 100% success. The two apps are ~90% duplicated of each other (run loop, types, source skeleton, networks, tests). Overall health: poor / not production-ready.

### Findings

#### [P2 (was P1)] Client ABIs omit required PayInfo `pay` parameter -> selector mismatch, every distribution tx reverts  `bug` _(conf:high)_
- **Where:** nft-multisender/infra/contracts.ts:54-115 (ERC721/1155 batchTransfer); token-multisender/infra/contracts.ts:37-66 (distributeSpecifiedDirect)
- **What:** The deployed contracts require a trailing `PayInfo calldata pay` argument and enforce a protocol fee via the `paid(pay)` modifier: ERC721Distribution.batchTransfer(nft, uint256[], address[], (bool) options, PayInfo pay); ERC1155Distribution.batchTransfer(nft, uint256[], uint256[], address[], (bool) options, PayInfo pay); ERC20Distribution.distributeSpecifiedDirect(token, address[], uint256[], (bool) options, PayInfo pay) — all `payable`/`paid(pay)`. The client ABIs declare these functions WITHOUT the `pay` parameter, so encodeFunctionData produces a 4-byte selector for a function that does not exist on the contract. The tx hits the contract fallback / reverts; no fee is paid. Net effect: the apps cannot transact against the real contracts even after placeholder addresses are filled in. (ETHDistribution.distributeSpecified has no pay param, so the native path's signature matches.)
- **Fix:** Root cause: client ABIs in the two infra/contracts.ts files declare the distribution functions WITHOUT the trailing `PayInfo` tuple that the deployed BiuBiuPayable-derived contracts require, so encodeFunctionData computes a 4-byte selector for a non-existent function and the call reverts to (absent) fallback.

Minimal fix (selector is the only thing that must change):
1) In nft-multisender/infra/contracts.ts: append to ERC721_DISTRIBUTION_ABI.batchTransfer.inputs and ERC1155_DISTRIBUTION_ABI.batchTransfer.inputs a param `{ name:'pay', type:'tuple', components:[{name:'referrer',type:'address'},{name:'source',type:'string'}] }`, and set stateMutability to 'payable'. In buildERC721BatchTransferTx / buildERC1155BatchTransferTx pass an additional arg `{ referrer: ZERO_ADDRESS, source: 'web' }` (or a real referrer).
2) In token-multisender/infra/contracts.ts: same for ERC20_DISTRIBUTION_ABI.distributeSpecifiedDirect (add the `pay` tuple, set 'payable'), and pass `{ referrer, source:'web' }` in buildERC20DistributeTx.
3) value handling: NOT required for correctness — paid(pay) treats msg.value==0 as a free call. If you intend to charge the gas-based fee, set tx.value to the estimateFee() result; otherwise leave value unset (free/premium path). Do NOT block the fix on value.
4) (No change needed for the native ETH path — distributeSpecified has no PayInfo and already matches.)
5) Add a regression guard: an integration test asserting toFunctionSelector(canonical deployed signature, incl. (address,string) PayInfo) === the selector encoded by each builder (slice tx.data to 10 chars). This would have caught all three mismatches (0x0cef6d8b / 0x81fac511 / 0x8ffefb13). Keep the deployment step (filling real, non-placeholder addresses) gated behind that test.

#### [P2 (was P1)] Partial on-chain failures reported to user as 100% success (contract Result/events never decoded)  `logic` _(conf:high)_
- **Where:** nft-multisender/infra/source.ts:69-84; token-multisender/infra/source.ts:64-73
- **What:** Both apps call the distribution contracts with allowPartialFailure:true (contracts.ts buildERC20DistributeTx/buildERC721BatchTransferTx/buildERC1155BatchTransferTx/buildNativeDistributeTx). When a recipient fails, the contract does NOT revert: it emits TransferSkipped, adds the index to Result.failedIndices, and for ETHDistribution.distributeSpecified it refunds the unsent ETH back to msg.sender (ETHDistribution.sol:113-116). The handler only checks receipt.status==='reverted' and otherwise hardcodes successCount = input.recipients.length, failedIndices: [], totalSent = full totalValue. So a batch where, e.g., several ERC721 tokens are no longer owned, an ERC1155 recipient rejects onERC1155Received, or an ETH recipient reverts, is reported as fully successful with the full amount sent — when in reality some recipients got nothing (and for native ETH the funds bounced back to the sender). This is a correctness + info-disclosure bug: the user trusts an airdrop completed when it partially failed.
- **Fix:** Root cause: the handlers fabricate the per-batch result (successCount = recipients.length, failedIndices = [], full totalSent) and only treat status === 'reverted' as failure, while the contracts are intentionally called in partial-failure mode (no top-level revert).

Minimal fix (two coordinated changes):

1. Expose logs on the wallet abstraction. In both types.ts, extend TransactionReceipt with logs: Array<{ address: Address; topics: Hex[]; data: Hex }> and make the concrete wallet adapter populate them from the real viem receipt. (decodeFunctionResult on a receipt is NOT valid — there is no return value in a receipt; you must read events, or alternatively do a pre-flight eth_call simulation of the same calldata and decode the returned Result tuple.)

2. In each source.ts handler, after confirming status !== 'reverted', parse receipt.logs for the contract's own events to derive the true result:
   - ERC20/native: count DistributedPartial(... totalSent, successCount, failCount) and/or TransferSkipped(... index, amount) emitted by the distribution contract address; set successCount, failedIndices, and totalSent from the decoded values (when no DistributedPartial/TransferSkipped is present, all succeeded).
   - ERC721: parse TransferSkipped(nft, recipient, index, tokenId) to populate failedIndices and failedTokenIds; successCount = recipients.length - failedIndices.length.
   - ERC1155: parse TransferSkipped(nft, recipient, index, tokenId, amount); subtract skipped amounts from totalSent and populate failedIndices.
   Use viem decodeEventLog with the corresponding event ABIs, filtering on log.address === the distribution contract.

Then formatOutput already aggregates failedIndices/failedTokenIds/totalSent correctly, so the UI will show real partial-failure counts with no further change. Recommend also surfacing failed indices/token IDs explicitly in the per-batch UI rows and adding a unit test that drives the handler with a mocked receipt containing TransferSkipped logs (the current specs bypass the handler and would not catch a regression).

Also pre-requisites before this can ship at all: replace PLACEHOLDER addresses with real deployments, and update contracts.ts ABIs to include the PayInfo pay tuple + add it to the encodeFunctionData args, matching the deployed contracts.

#### [P2] Division-by-zero throws raw RangeError in equal mode when no valid recipients  `bug` _(conf:high)_
- **Where:** token-multisender/executor.ts:71 (parseRecipients, equal mode)
- **What:** In equal distribution mode, if every input line is invalid/empty, `recipients` is empty and `total / BigInt(recipients.length)` evaluates to `total / 0n`, throwing an unhandled RangeError 'Division by zero'. This happens INSIDE parseRecipients, before validate's friendly 'No valid recipients found' guard at executor.ts:125, so the user gets a cryptic crash instead of the actionable message. Trigger: select equal mode, paste only comments/blank lines or malformed addresses, provide a totalAmount.
- **Fix:** Guard before dividing: `if (recipients.length === 0) return recipients;` (or throw the same 'No valid recipients' error) at the top of the equal branch, so validate's guard or a clear message handles it.

#### [P2] On resume, a previously-completed job that re-emits would be double-counted / duplicated  `bug` _(conf:medium)_
- **Where:** token-multisender/executor.ts:298-343; nft-multisender/executor.ts:245-290
- **What:** On resume the code seeds batchResults/failures from task.getResults({status:'completed'|'failed'}) and sets completed = batchResults.length + failures.length. It then registers job:complete/job:failed handlers that unconditionally push and completed++. This is only correct if TaskHub guarantees resumed runs never re-emit terminal events for already-terminal jobs. If a completed/failed job re-emits on resume (or a job is both in getResults and re-run), batchResults gets duplicate entries and completed exceeds totalBatches, inflating stats.totalSuccessCount/totalSent. There is no dedup by batchIndex.
- **Fix:** Track a Set<number> of already-recorded batchIndex values seeded from the restored results, and in the handlers skip pushes for indices already present (and only completed++ for new ones). This makes the resume path idempotent regardless of TaskHub emit semantics.

#### [P2] ERC20 token decimals fetched on-chain but recipient amounts were parsed with network decimals  `logic` _(conf:high)_
- **Where:** token-multisender/executor.ts:116-123 (validate uses networkConfig.decimals) vs 171-187 (run fetches token decimals)
- **What:** In validate(), recipient amounts are parsed with `decimals = networkConfig.decimals` (always 18). At run time, for ERC20 the real token decimals are fetched (tokenDecimals) and used only for display/confirmation. The amounts actually sent (parseUnits with 18) are NOT re-scaled to the token's real decimals. For a 6-decimal token like USDC, a user entering '100' produces 100*10^18 base units instead of 100*10^6 — a 10^12x over-send (and the confirmation prompt shows formatUnits(totalAmount, tokenDecimals=6) = an astronomically wrong number). The balance check at 197 (compares 18-dec amount to real balance) would usually catch it as 'Insufficient', but for tokens with >=18 decimals or large balances it could pass and massively over-send.
- **Fix:** Fetch token decimals before parsing recipient amounts (or re-parse after fetching) so parseUnits uses the token's actual decimals, not networkConfig.decimals. Native path can keep networkConfig.decimals.

#### [P3] native distribute uses gasLimit:0 (unlimited per-transfer call) enabling griefing/gas exhaustion  `bug` _(conf:medium)_
- **Where:** token-multisender/infra/contracts.ts:125 (buildNativeDistributeTx args gasLimit:0n)
- **What:** buildNativeDistributeTx passes options.gasLimit = 0n, which the contract interprets as _trySendUnlimited (ETHDistribution.sol:258-260,343-346) — forwarding all remaining gas to each recipient's fallback. A single malicious/contract recipient can consume the entire tx gas (gas-griefing), causing the whole batch tx to run out of gas and revert, or burn the user's gas. The contract supports a per-transfer gasLimit (DEFAULT_GAS_LIMIT=50000) specifically to bound this, but the client never uses it.
- **Fix:** Pass a bounded per-transfer gasLimit (e.g. 50000 or a configurable value) instead of 0n in buildNativeDistributeTx so one bad recipient cannot exhaust the batch.

#### [P3] ERC1155 totalSent computed by client (sum of input amounts) instead of actual sent  `bug` _(conf:high)_
- **Where:** nft-multisender/infra/source.ts:70-74
- **What:** For ERC1155 the handler computes totalSent as the sum of the INPUT amounts, not the contract's Result.totalSent. Combined with finding #2 (allowPartialFailure), if some transfers are skipped the reported totalSent overstates what was actually delivered. Same root cause as #2.
- **Fix:** Use the contract Result.totalSent (decoded) rather than summing input amounts.

#### [P3] isRetryable does not detect 'out of gas' / 'insufficient funds'; reverted txs consume the user's gas before being marked non-retryable  `bug` _(conf:low)_
- **Where:** nft-multisender/infra/source.ts:92-106; token-multisender/infra/source.ts:80-94
- **What:** isRetryable only matches a small keyword set. An 'out of gas' or 'insufficient funds for gas' failure returns false (treated as non-retryable) even though it may be transient/fixable, while transient RPC errors not containing 'timeout'/'network' (e.g. 'fetch failed', 'request failed', HTTP 5xx) also return false and won't retry. This is brittle string-matching at a trust boundary.
- **Fix:** Broaden the transient set (add 'fetch failed','503','502','rate','econnreset','underpriced','replacement') or classify by error type/code rather than substring, and keep user-rejection/revert as non-retryable.

#### [P3] No tests for ERC20 decimals path, equal-mode division-by-zero, resume restore, or partial-failure decoding  `test-gap` _(conf:high)_
- **Where:** token-multisender/executor.spec.ts; nft-multisender/executor.spec.ts
- **What:** Tests cover parseRecipients/validate/formatOutput and a happy-path + cancel + close-on-error for the executor, but never exercise: (a) ERC20 with non-18 decimals (would have caught finding #5), (b) equal mode with zero valid recipients (finding #3), (c) the isResume getResults restore path, (d) job:failed -> select continue/abort interrupt flow, (e) partial on-chain failure decoding (finding #2 — the mocked output is always fully-successful). Core distribution flows are effectively untested for failure modes.
- **Fix:** Add unit tests for the ERC20 decimals scaling, equal-mode empty-recipients guard, the resume restore branch, and a job:failed interrupt -> abort flow; add an integration-style test asserting handler surfaces failedIndices when the (mocked) receipt/return indicates partial failure.

### Dead code
- Both apps are entirely unreferenced: createNftMultisenderApp (nft-multisender/index.ts:6) and createTokenMultisenderApp (token-multisender/index.ts:6) are never imported/called anywhere in the monorepo; there is no route under src/routes/apps/{nft,token}-multisender, no adapter, no i18n keys, no CLI script. Dead until wired up.
- All distribution contract addresses are zero-address placeholders: nft-multisender/infra/networks.ts:18,30-31,43-44,... and token-multisender/infra/networks.ts:18,31-32,... use PLACEHOLDER = 0x000...000 for every chain. Any real run would send to 0x0.
- Unused import `Hex` in token-multisender/infra/contracts.ts:1 (only Address/encodeFunctionData are used).
- CHAIN_MAP exported from both networks.ts (nft-multisender/infra/networks.ts:97 and token-multisender/infra/networks.ts:103) is never imported anywhere — dead export.
- failedTokenIds machinery in nft-multisender is dead: source.ts:81 hardcodes failedTokenIds: [] and it is never decoded or surfaced (types.ts:50, output never reads it).
- In nft-multisender, the optional NftBatchOutput.failedTokenIds and the whole failedIndices/totalFailedIndices path can only ever be 0/empty because the handler never reads the contract return — formatOutput stats.totalFailedIndices (executor.ts:404) is effectively always 0.

### Duplication
- The entire run() generator (~250 lines: TaskHub setup, merkle/resume, getResults paging, event handlers, launchTask, interrupt loop, retry/partial/abort select, finally cleanup) is duplicated near-verbatim between nft-multisender/executor.ts:141-391 and token-multisender/executor.ts:152-444. Only the preflight (approval vs balance/allowance) and labels differ. Extract a shared generic runBatchDistribution(validated, ctx, source, hub-deps, {preflight}) into $lib/pda-apps/_shared (or $lib/async).
- WalletDeps, TransactionRequest, TransactionReceipt, ReadContractParams are byte-identical in nft-multisender/types.ts:72-98 and token-multisender/types.ts:72-98. BatchFailure and RunResult shapes are also identical. Move to one shared module.
- TaskSource skeleton is duplicated: isRetryable() and isRateLimited() are byte-identical in nft-multisender/infra/source.ts:92-110 and token-multisender/infra/source.ts:80-98, and the handler send->wait->revert-check->return pattern is the same. Extract a shared base class.
- networks.ts is duplicated: identical endurance defineChain, PLACEHOLDER, RPC lists, explorer URLs and CHAIN_MAP between nft-multisender/infra/networks.ts and token-multisender/infra/networks.ts; only the *DistributionAddress field names and `decimals` differ.
- index.ts is identical except names (nft-multisender/index.ts vs token-multisender/index.ts).
- The two executor.spec.ts test harnesses (vi.hoisted mockTask/mockHub, the @shelchin/taskhub mock, createMockCtx, driveExecutor) are duplicated verbatim between nft-multisender/executor.spec.ts:14-119 and token-multisender/executor.spec.ts:14-118.


## pda-apps/revoke

- **Tests:** none · **Files reviewed:** 13
- A revoke.cash-style approval finder/revoker: curated Multicall3 fast-scan of ERC20 allowances, ERC721/1155 operator approvals, and Permit2 sub-allowances across 13 built-in + custom chains, then single or atomic-batch revoke through the shared ConnectedWallet (Safe MultiSend / EIP-5792). The revoke encoding (approve(spender,0), setApprovalForAll(op,false), Permit2 lockdown) is correct and the scan logic is sound (allowFailure isolates missing contracts, expiry/zero filtering is right, unlimited heuristics are reasonable). Overall health is good for a read-mostly tool, but there are two real correctness bugs around concurrent/stale scans when switching chains, plus several pieces of dead code and zero automated tests for the whole feature.

### Findings

#### [P2] Switching chains mid-scan leaves stale cross-chain approvals that never auto-correct (race)  `logic` _(conf:high)_
- **Where:** store.svelte.ts:126-153 (autoScan + scan), 113-122 (setNetwork)
- **What:** scan() has no re-entrancy guard and no generation/cancellation token. Sequence: user is on chain A, scan() #1 is in-flight (this.scanning=true). User picks chain B → setNetwork clears rows and lastScanKey, the page $effect (+page.svelte:44-48 tracks networkSlug) re-fires autoScan(B). But autoScan returns early because of the `|| this.scanning` guard and does NOT set lastScanKey. When scan() #1 finally resolves, it assigns `this.rows = <chain-A results>` and sets scanned=true, while this.network is now chain B. No tracked dependency changes again, so the auto-scan never re-runs. Result: the table shows chain-A approvals labelled/explorer-linked under chain B, and if the user clicks Revoke, runRevoke builds calls against chain-A token/spender addresses but sends on chain B (wrong target). Trigger: switch network while the first scan is still running (easy on slow public RPC).
- **Fix:** Add a monotonically increasing scan generation token: at the top of scan() capture `const gen = ++this.scanGen`; before assigning results check `if (gen !== this.scanGen) return;`. Bump this.scanGen inside setNetwork so the stale scan's assignment is discarded. This also makes manual rescan / custom-add scans safe to overlap.

#### [P2] Custom token/spender add+remove fire overlapping scan() calls with no guard (race)  `logic` _(conf:high)_
- **Where:** store.svelte.ts:133-153 (scan); 232/247/279/294 (addCustomToken/removeCustomToken/addCustomSpender/removeCustomSpender each await this.scan())
- **What:** scan() does not bail when a scan is already running (no `if (this.scanning) return`). Adding two custom tokens in quick succession, or adding while the auto-scan is still in-flight, starts concurrent discover() calls. They race on this.rows (last writer wins) and the first to hit `finally` sets this.scanning=false while another is still running, so the loading state and rows can end up inconsistent (e.g. spinner clears but a later scan overwrites rows, or an earlier scan that excluded the just-added token wins). Same root cause as the chain-switch bug.
- **Fix:** Same generation-token fix covers this: guard the result assignment by generation so only the latest scan writes this.rows/scanning, and increment the generation at the start of every scan() and on setNetwork.

#### [P3] phaseLabel maps SendStatus values the revoke flow never emits (building/estimating/submitting)  `logic` _(conf:high)_
- **Where:** +page.svelte:54-63; cross-ref core/revoke.ts + wallet backends
- **What:** phaseLabel covers all 8 SendStatus values, but runRevoke→sendCalls only emits checking/signing/waiting/confirmed/failed in both the biubiu and eip1193 backends. building/estimating/submitting are never produced for this flow, so those 3 i18n keys (revoke.phase.building/estimating/submitting) are translated in all 15 locales but unreachable. Not a bug (defensive), but it is dead translation surface that must be kept in sync forever.
- **Fix:** Either trim phaseLabel + the 3 keys to the statuses this flow actually emits, or leave a comment that it intentionally mirrors the full SendStatus union. No functional change needed.

#### [P3] ApprovalRow.fromLogs + ERC721 getApproved/single-token revoke + RevokeOutcome are dead  `dead-code` _(conf:high)_
- **Where:** types.ts:74 (fromLogs), types.ts:78-84 (RevokeOutcome), abis.ts:45-48 (getApproved/approve(tokenId))
- **What:** The deep log scan and single-token ERC721 approval handling were cut (per project memory: deep getLogs scan was removed), but the supporting surface remains: fromLogs is never set/read, RevokeOutcome is never imported, and the getApproved/approve(to,tokenId) ABI entries are never used (no code path discovers or revokes a single-tokenId ERC721 approval). This is misleading because the comments still advertise a "deep scan" that does not exist.
- **Fix:** Remove ApprovalRow.fromLogs, the RevokeOutcome interface, and the two ERC721 single-token ABI entries (and their "deep scan" comments). If single-tokenId revoke is planned, leave a TODO instead of unused declarations.

#### [P3] Permit2 listed twice in CROSS_CHAIN_SPENDERS  `duplication` _(conf:high)_
- **Where:** registry/spenders.ts:24 and 33
- **What:** Line 24 adds Permit2 via PERMIT2_ADDRESS and line 33 adds the same literal address again with the same label/kind. spendersForChain dedupes by lowercased address so the second entry is silently dropped — pure dead duplication. The inline comment frames it as intentional "for clarity", but it adds a probe entry that can never survive dedupe and invites confusion.
- **Fix:** Delete line 33 (the duplicate Permit2 literal); keep only the PERMIT2_ADDRESS entry on line 24.

#### [P3] Zero automated tests for the entire revoke feature (scan + encoding)  `test-gap` _(conf:high)_
- **Where:** src/lib/pda-apps/revoke/** (no *.test.ts / *.spec.ts)
- **What:** The two most safety-relevant pieces — buildRevokeCall encoding (Permit2 lockdown vs ERC20 approve(0) vs setApprovalForAll(false)) and scanApprovals filtering (allowance>0, isApprovedForAll===true, Permit2 amount>0 && not-expired, unlimited heuristics) — have no tests. A regression in selector/args encoding would silently send a no-op or wrong revoke; a regression in the expiry/zero filter would hide active approvals. The wallet backends are well-tested but nothing exercises this app's encoding/scan.
- **Fix:** Add a unit spec asserting buildRevokeCall output (to/value/data selector+args) for one row of each kind incl. a Permit2 row, plus a scanApprovals spec with a mocked client.multicall returning success/failure/zero/expired cases to lock in the filtering. These are pure functions, easy to test.

#### [P3] Custom token cannot override a built-in token's metadata; silently dropped by dedupe  `logic` _(conf:medium)_
- **Where:** discover.ts:44 (tokensForChain spread first, customTokens second) + dedupeTokens:18-26
- **What:** dedupeTokens keeps the FIRST occurrence per `${standard}:${address}` and built-ins are spread before customTokens, so a user-added custom token with the same address+standard as a built-in is dropped from the scan even though store.addCustomToken persisted it and the UI shows its chip. Harmless for scanning (the built-in already covers that pair) but the chip + persisted entry are misleading (the user thinks their custom symbol/decimals are in effect; they are not).
- **Fix:** Either skip persisting/showing a custom token that collides with a built-in (warn in the add form), or put customTokens first in the spread so user metadata wins. Pick one and make the chip reflect reality.

### Dead code
- types.ts:74 — ApprovalRow.fromLogs is declared and documented ("Surfaced by the deep log scan") but never set or read anywhere; the deep log scan was cut (per memory) so this field is dead.
- types.ts:78-84 — RevokeOutcome interface is exported but never imported/used anywhere in the app (runRevoke returns SendResult, not RevokeOutcome).
- abis.ts:45-48 — NFT_ABI getApproved + approve(to,tokenId) entries are commented "deep scan / advanced" but no code calls either; single-token ERC721 approvals are never scanned or revoked.
- abis.ts:12 / MAX_UINT256 — exported but only used internally by isUnlimited in the same file; export is unnecessary (no external consumer).
- registry/spenders.ts:33 — Permit2 (0x0000...78BA3) is listed a SECOND time in CROSS_CHAIN_SPENDERS, identical address to line 24; spendersForChain dedupes it, so line 33 is pure dead duplication (the comment even says it's "twice on purpose for clarity").
- discover.ts:18-26 dedupeTokens / 28-36 dedupeSpenders duplicate the exact address-lowercase Set-dedup logic already in registry/spenders.ts:96-102 (see duplication).

### Duplication
- Address-dedup-by-lowercase Set pattern is implemented 3x with identical logic: discover.ts:18-26 (dedupeTokens), discover.ts:28-36 (dedupeSpenders), and registry/spenders.ts:96-102 (spendersForChain). Extract one `dedupeBy(list, keyFn)` helper and reuse.
- custom-store.ts:56-67 (put), 69-80 (del), 44-54 (getAll) repeat the same openDB().then(new Promise(... tx.oncomplete/onerror ...)) IndexedDB boilerplate per operation; a single `withStore(store, mode, fn)` wrapper would remove the repetition. Low priority (works, but churn-prone).


## pda-apps/wallet-sweep

- **Tests:** sparse · **Files reviewed:** 21
- EIP-7702 multi-EOA sweep tool: a throwaway "relay" EOA deploys a global BatchSweeper + a per-relay Sweeper7702 (controller = relay, immutable, CREATE2), signs 7702 authorizations for the imported EOAs, and pulls native+ERC20 to a user-chosen destination in one type-4 tx per chunk. The on-chain contracts are small, sound, and well-tested in Forge (tx.origin==controller guard, immutable controller, per-EOA try/catch, fee forwarding). The off-chain TS layer (store, relayer, sweep, deploy, rpc) is the weak point: it has ZERO unit tests, persists the relay private key in plaintext localStorage indefinitely, and the security model around left-delegated EOAs is misrepresented to users. Most issues are P1/P2 around key handling, retry semantics, and RPC timeout coverage; the contracts themselves are healthy.

### Findings

#### [P1] Left-delegated EOAs + plaintext relay key in localStorage = attacker can redirect future funds to ANY destination (relay file's reassurance is false)  `security` _(conf:high)_
- **Where:** infra/relayer.ts:96-112 (relayFileContent) + 173-190 (plaintext localStorage) + contracts Sweeper7702.sol:48 (dest is a caller param)
- **What:** Sweeper7702.sweep(dest, erc20s) only checks tx.origin==controller; `dest` is supplied fresh on every call, NOT pinned at delegation time. The relay (controller) key is stored UNENCRYPTED in localStorage['wallet-sweep-relayer'] keyed by network slug, and is never auto-cleared after recoverGas/done. Imported EOAs remain delegated to the Sweeper until the user explicitly revokes (an optional step on the Done screen). Attack: an attacker who reads localStorage (XSS, shared/forensic machine, malicious extension) obtains the relay key; if any still-delegated EOA later receives funds, the attacker calls BatchSweeper.sweepMany with their OWN dest and drains it — funds, not just gas. The downloaded relay key file explicitly tells the user 'Anyone with this key ... cannot redirect a sweep — the destination is fixed per transaction', which is misleading: the holder of the key picks the destination on each new transaction.
- **Fix:** Root cause: the threat model assumes the controller/relay key only ever controls leftover gas, but the contract lets the controller redirect any still-delegated EOA's full balance to an arbitrary dest on every call — so the persisted plaintext relay key is a standing bearer authority over all not-yet-revoked EOAs, and the UI/file copy hides this.

Minimal fixes (in priority order):

(1) Correct the lie in relayFileContent (relayer.ts:107-108). Replace the parenthetical with the truth, e.g.: "Anyone who holds this key can sweep ANY still-delegated EOA to ANY address until you REVOKE the delegations. Delete this key after you have revoked." This is a one-line copy change and is the highest-value fix.

(2) Make revoke prominent / steer the user to it. On the Done screen (WalletSweepDone.svelte), move/elevate the revoke card above the fold or surface a clear post-sweep prompt ("Recommended: revoke delegations now") instead of an optional card below the success block.

(3) Stop persisting the raw key longer than needed. Auto-call clearRelayer(slug) after a successful recoverGas/reset on the Done flow (wire the existing clearRelayWallet() into recoverRelayGas() success and/or reset()), and consider not persisting the raw key at all (session-scoped, or encrypted at rest). At minimum, clear it once the user has revoked + recovered gas.

Optional hardening (larger change, not required for P1): pin dest at delegation time so the controller cannot redirect — e.g. bake dest into the Sweeper7702 constructor alongside controller (CREATE2 salt already makes it per-relay), making the file's original reassurance actually true. This removes the "future funds" escalation entirely but changes the per-relay deploy model.

#### [P2 (was P1)] Core money-moving TS layer has zero automated tests  `test-gap` _(conf:high)_
- **Where:** src/lib/pda-apps/wallet-sweep/ (no *.test.ts anywhere; only Forge tests exist for the contracts)
- **What:** The contracts are well covered by Sweeper7702.t.sol, but the entire off-chain orchestration that decides nonces, gas, chunking, fee placement, balance-filtering, dedup, and 7702 authorization nonces (sweep.ts, relayer.ts, authorizations.ts, deploy-sweeper.ts) is untested. classifyCode's 7702 designator parsing (authorizations.ts:31-40), the 'fee only on chunk 0' invariant, re-sweep idempotency, and verifyRelayFile are exactly the kind of logic where a regression silently strands gas or double-charges — yet nothing guards them.
- **Fix:** No production code change is needed — the gap is missing tests. Add src/lib/pda-apps/wallet-sweep/infra/*.test.ts (vitest is already configured; mirror the existing contract-caller/e2e-chat test style). Highest-value, fully network-free cases:

1. classifyCode (authorizations.ts) — '0x'/'0x0'/'' → 'none'; valid 0xef0100+20-byte designator matching ourSweeper (mixed case both sides) → 'ours'; same length but different target → 'foreign'; 0xef0100 with wrong length (not 23 bytes) → 'contract'; arbitrary bytecode → 'contract'. This guards the misclassify-→-skip/strand risk.
2. encodeSweepMany (sweep.ts) — assert it equals viem encodeFunctionData against BATCHSWEEPER_ABI with args in order [eoas, dest, erc20s, feeCollector] (lock the arg order against accidental reordering).
3. "fee only on chunk 0" — extract the chunk-value rule (or assert via a thin seam) that value === feeWei only for chunkIndex 0 and 0n otherwise; protects against multi-charge.
4. verifyRelayFile (relayer.ts) — matching key text → true; mismatched address/key → false; no 0x key in text → false; garbage → false (it gates revealing the funding QR).
5. parsePrivateKey (authorizations.ts) — with/without 0x prefix, wrong length, non-hex → null; valid → {address, privateKey}.
6. dedupeKeys (authorizations.ts) — case-insensitive dedupe keeping first occurrence.
7. chunk + mapLimit (tx-utils.ts) — chunk: exact multiples, remainder, size>len, empty; mapLimit: preserves index→result order, respects concurrency limit (e.g. track in-flight max), handles empty array.
8. (optional) estimateFundingWei (relayer.ts) — inject getGasPrice via a stub and assert monotonic growth in eoaCount/tokenCount and that feeWei is added once.

These need no network/RPC and would catch the highest-risk silent regressions (stranded gas, double fee, dropped/misclassified EOAs).

#### [P2] RPC per-attempt timeout does not cover the response-body read — a server that sends headers then stalls hangs forever and never fails over  `bug` _(conf:high)_
- **Where:** infra/rpc.ts:26-43
- **What:** clearTimeout(timer) is called at line 33 immediately after `await fetch(...)` resolves, BEFORE `await res.json()` (line 38). The AbortController only aborts the fetch up to the headers; once headers arrive the timer is cleared, so a hung/slow response body blocks indefinitely with no failover to the next RPC. The file's own header comment promises 'a hung endpoint ... would block the whole flow forever' is prevented — but it isn't for slow bodies. During a sweep this leaves the whole operation (and UI) stuck.
- **Fix:** Clear the timer only in a finally after res.json() completes, or move clearTimeout(timer) to after the json parse. Keep the AbortController signal alive across the body read so res.json() is also aborted on timeout (an aborted body read throws and falls through to the next RPC).

#### [P2] Service fee is re-charged in full on every re-sweep / manual retry of a flaky run  `logic` _(conf:medium)_
- **Where:** store.svelte.ts:450-469 (sweepAgain) + 471-506 (executeSweep) → infra/sweep.ts:111 (value = i===0 ? feeWei : 0n)
- **What:** The fee rides as msg.value on chunk 0 of every runSweep call. proceed() and sweepAgain() both call executeSweep→runSweep, each starting a fresh chunk 0 with the full fee. If a sweep partially fails and the user clicks 'Sweep again' (the prominent primary button on Done), they pay the full service fee again even though nothing changed except retrying. There is no idempotency key or 'fee already paid this session' guard. A user retrying a flaky run several times is over-charged once per attempt.
- **Fix:** Track whether the fee was already collected for the current relay/destination session (e.g. a feePaid flag set when a chunk-0 tx confirms) and pass feeWei=0 on subsequent runSweep calls until the user starts a genuinely new operation (reset/new destination).

#### [P2] Funding estimate can underfund multi-chunk sweeps because deploy gas is double-counted but per-chunk fixed overhead is not  `logic` _(conf:medium)_
- **Where:** infra/relayer.ts:75-89 (estimateFundingWei) vs infra/sweep.ts:114-116 (per-chunk gas)
- **What:** estimateFundingWei computes one flat `units = 60_000 + deploy + perEoa*eoaCount`. runSweep instead spends 60_000 fixed overhead PER CHUNK (sweep.ts:116) plus the CREATE2 deploys are separate transactions whose gas is node-estimated (deployVia sets no explicit gas, relayer.ts assumes 600k+300k). For a large sweep (e.g. 300 EOAs at maxBatchUpgrade=50 → 6 chunks) the estimate covers 60k of fixed overhead but the real cost is ~6×60k of fixed overhead plus 6 separate tx 21k intrinsics. The 2x price multiplier provides some cushion, but on a chain with a price spike or many chunks the relay can run out of gas mid-sweep, leaving a partial sweep and stranded delegations.
- **Fix:** Compute chunk count = ceil(eoaCount / maxBatchUpgrade) and multiply the 60_000 fixed overhead (and add a 21_000 intrinsic) per chunk in estimateFundingWei, matching runSweep's actual per-chunk spend.

#### [P2] Custom-network creation and persistence accept plain-HTTP RPC URLs  `security` _(conf:medium)_
- **Where:** infra/networks.ts:155 (makeCustomNetwork filter /^https?:/) + store.svelte.ts:225-249 (addCustomNetwork)
- **What:** makeCustomNetwork keeps any rpc matching /^https?:\/\// — i.e. http:// is allowed, and the value is persisted to localStorage['wallet-sweep-custom-networks'] and later used to broadcast type-4 txs carrying signed 7702 authorizations and to read balances. A plain-HTTP RPC is trivially MITM-able on a hostile network; an attacker could feed a manipulated chainId/nonce/gasPrice or simply observe the broadcast. For a tool whose whole job is moving funds across many wallets, non-TLS endpoints should be rejected.
- **Fix:** Restrict the RPC filter to /^https:\/\// (https only) in makeCustomNetwork, and surface a clear validation error in addCustomNetwork when an http:// URL is entered.

#### [P3] Service fee is fully client-enforced and trivially bypassable (client sets feeWei=0)  `security` _(conf:high)_
- **Where:** infra/fee.ts:59-76 (quoteSweepFee) + store.svelte.ts:439,462 (passes fee?.amount to sweep) + contracts BatchSweeper.sol:38-42
- **What:** The fee amount and the member waiver (isMember/feeWaived) are computed entirely client-side and passed as msg.value; BatchSweeper only forwards whatever value it receives and never enforces a minimum. A user editing the client (or anyone calling BatchSweeper directly) sweeps with zero fee. This is the documented/accepted membership model (member-proof.svelte.ts header), so it is informational rather than a defect — but it should be acknowledged that fee revenue is best-effort and not protocol-enforced.
- **Fix:** No code change required if the product accepts client-side fees. If fee enforcement is ever desired, the fee must be charged inside BatchSweeper (e.g. require msg.value >= quotedMin signed by a backend) rather than trusted from the caller.

#### [P3] Delegation classification queried twice per wallet (preflight planSweep + per-chunk runSweep)  `perf` _(conf:medium)_
- **Where:** infra/sweep.ts:47-59 (planSweep) and 100-103 (runSweep toAuth)
- **What:** preflight runs planSweep over all keys (one getCode each), then proceed→runSweep re-runs getDelegation for every key in every chunk to recompute which still need authorization. For large wallet sets this is 2x the eth_getCode calls and can trigger public-RPC rate limits the rest of the code works hard to avoid (mapLimit/Multicall3).
- **Fix:** Carry the per-address Delegation from the SweepPlan into runSweep (e.g. a Map<address,Delegation>) and skip re-querying; only the 'ours' set is needed to decide toAuth.

### Dead code
- SweepNetwork.multiSendAddress (types.ts:27, networks.ts:37) — set to MULTICALL3 on every network and never read anywhere in v2; comment admits 'unused in v2'. Pure legacy carry-over from the v1 Safe MultiSend design.
- SweepNetwork.supports7702 / NetworkReadiness.ready (types.ts:33,46) — supports7702 is hardcoded true for every curated and custom network and is never branched on; probeNetwork always sets ready=reachable. Both fields are effectively constants.
- deploy-sweeper.ts:42-54 batchSweeperAddress() / sweeperAddressFor() / isBatchSweeperDeployed-by-address variants — sweeperAddressFor and batchSweeperAddress wrappers are never imported by the store or widgets (store uses predictSweeperAddress / isSweeperDeployed directly). Confirm via grep before deleting.
- NetworkReadiness.error path in store.probe — readiness.error is stored but no widget surfaces a probe error string (only reachable boolean is read).

### Duplication
- getDelegation/getCode is fetched twice per EOA per sweep: planSweep (sweep.ts:53-54, called in preflight) classifies every key, then runSweep (sweep.ts:100-103) re-classifies every key in each chunk to compute toAuth. For N wallets this doubles the getCode RPC load. Reuse the plan's classification (pass already-known 'ours' set into runSweep) instead of re-querying.
- Relay/sweep/revoke share an identical type-4-broadcast skeleton (privateKeyToAccount → makeWalletClient → getPendingNonce → per-chunk authorizationList → sendTransaction → waitForReceipt) duplicated across sweep.ts:84-130 and revoke.ts:30-51. Could extract a single signedTypeTx(group, target|sweepData) helper.
- Fee logic (fee.ts) is a near-verbatim copy of token-sender/infra/fee-config consumers; the AGGREGATOR_ABI + fetchNativeUsdPrice + member-free→config→usd→fallback ladder is duplicated rather than imported from a shared fee module (the file comment even says 'Same amount policy + constants as token-sender so they never diverge' — which is exactly the case for sharing one implementation).


## pda-apps/wallet-generator

- **Tests:** partial · **Files reviewed:** 13
- Deterministic brainwallet generator: passphrase → SHA-256/MD5 entropy → BIP39 mnemonic → BIP32 EVM derivation, plus crypto-hdkey (xpub) QR export and air-gapped UR sign (eth-sign-request → eth-signature). The legacy-compat key derivation is correct and well-tested with golden vectors (intentionally weak by design, clearly documented — not flagged). Crypto hygiene is sound (no IV/nonce reuse; ECDSA via viem uses deterministic RFC6979; keys stay client-side and out of logs). The main real defect is in the air-gapped sign path: binary personal_sign payloads are round-tripped through UTF-8 and silently corrupted, so the signer signs the wrong bytes. Overall health is good with one correctness bug, one signing-UX hardening gap, and some duplication/test gaps in the sign/store paths.

### Findings

#### [P2 (was P1)] Air-gapped signer corrupts binary personal_sign payloads (signs the wrong message)  `bug` _(conf:high)_
- **Where:** crypto/sign.ts:75-76 (parse) and 114-116 (sign)
- **What:** For dataType 3 (personalMessage), parseSignRequest decodes the request's raw sign-data bytes as UTF-8 (`fromBytes(req.getSignData(), 'string')`) and signRequest then signs that string via `account.signMessage({ message: parsed.message })`, which re-encodes it with TextEncoder. This round-trip is lossy for any non-UTF-8 bytes. Verified: input bytes 0x80ff0041 decode to two U+FFFD replacement chars and re-encode to 0xefbfbdefbfbd0041 — completely different bytes. personal_sign / eth_sign requests very commonly carry arbitrary binary (e.g. raw 32-byte digests, packed structs). The signer therefore produces a valid ECDSA signature over a MANGLED message, not the bytes the dapp requested. Impact: at best the dapp rejects the signature (broken air-gapped flow for binary messages); at worst the user believes they signed the previewed content while the signature commits to different bytes. ASCII messages happen to round-trip, which is why the single spec test (an ASCII string) passes and hides this.
- **Fix:** Root cause: dataType 3 (personalMessage / personal_sign) carries arbitrary bytes, but parseSignRequest stores only a lossy UTF-8 decode (fromBytes(req.getSignData(), 'string')) and signRequest signs that string, which viem re-encodes with TextEncoder — corrupting any non-UTF-8 input. Minimal fix:\n\n1) In ParsedSignRequest add an optional `messageBytes?: Uint8Array` (or hex string).\n2) In parseSignRequest dataType===3 branch (sign.ts:75-77): keep the UTF-8 string for PREVIEW only and also retain the raw bytes, e.g. `parsed.message = fromBytes(req.getSignData(), 'string'); parsed.messageBytes = req.getSignData();`\n3) In signRequest else-branch (sign.ts:114-116): sign the exact bytes, e.g. `if (!parsed.messageBytes) throw new Error('Missing message'); signature = await account.signMessage({ message: { raw: toHex(parsed.messageBytes) } });` (the { raw } form preserves the EIP-191 prefix, so it is still a correct personal_sign).\n4) Add a spec covering a non-UTF-8 / hex-bytes personalMessage payload (e.g. 0x80ff0041) and assert recoverMessageAddress({ message: { raw }, signature }) === derived address. Existing ASCII test still passes since ASCII round-trips. Optional UX hardening: in SignPanel show a hex fallback when the message contains U+FFFD so users see they are signing binary.

#### [P2] signRequest signs regardless of fingerprint match; UI lets user sign a mismatched request  `security` _(conf:medium)_
- **Where:** crypto/sign.ts:86-117 (no fingerprint guard) and routes/apps/wallet-generator/SignPanel.svelte:134 (`disabled={signing}` only)
- **What:** parseSignRequest computes `fingerprintMatches` (request XFP vs this mnemonic's XFP) but signRequest never enforces it and signs at the request-supplied `parsed.path` unconditionally. SignPanel shows a red 'fpBad' banner but the Sign button stays enabled on mismatch. An eth-sign-request whose source fingerprint does not belong to this wallet is, by definition, intended for a different key; signing it here either (a) silently produces a signature from the wrong key (footgun the user can't detect from the preview) or (b) is an attacker steering the air-gapped signer into signing content with a key the requester didn't expect. For a security tool whose whole value is offline isolation, an unmatched fingerprint should be a hard stop, not an advisory color.
- **Fix:** Make the fingerprint check load-bearing: in signRequest, `if (!parsed.fingerprintMatches) throw new Error('Fingerprint does not match this wallet')` (this is the single enforcement point shared by all callers). In SignPanel, also gate the button: `disabled={signing || !parsed.fingerprintMatches}` and explain why. Add a spec asserting signRequest rejects a deadbeef-XFP request.

#### [P3] Legacy tx (dataType 1) and typed-data (dataType 2) sign paths and the whole UI store are untested  `test-gap` _(conf:high)_
- **Where:** crypto/ur-sign.spec.ts (only covers ASCII personalMessage + EIP-1559 typedTransaction); store.svelte.ts (no tests)
- **What:** ur-sign.spec.ts exercises dataType 3 (ASCII) and dataType 4 (EIP-1559). It does NOT cover dataType 1 (legacy pre-EIP-155 tx — where parseTransaction→re-serialize→signTransaction is most likely to drop/alter fields) or dataType 2 (EIP-712 typed-data, where `JSON.parse(parsed.typedData)` is fed untrusted scanned JSON straight into account.signTypedData). store.svelte.ts (generate/clearResults invalidation invariant, paging, NaN coercion at lines 174-177, download helpers) has zero tests despite being the GUI's derivation path that is supposed to be byte-identical to the executor. The TESTING.md is a manual MCP script, not automated coverage.
- **Fix:** Add specs: (1) construct + sign a legacy (type 0) eth-sign-request and recover the address; (2) a dataType-2 EIP-712 request and recover via verifyTypedData; (3) unit-test store.generate() golden-vector equality with executor output, the clearResults() invalidation on passphrase/wordsLen/hdPath change, and the NaN→safe-default coercion.

#### [P3] store.generate() swallows derivation errors with no UI surface  `logic` _(conf:medium)_
- **Where:** store.svelte.ts:184-202
- **What:** generate() wraps derivation in try/finally (no catch); the finally only resets `generating`. If passphraseToMnemonic or deriver.derive throws (e.g. an unexpected HDKey edge case), the rejection propagates as an unhandled promise rejection and the user sees nothing — the generate tab has no error alert element at all (unlike XpubPanel/SignPanel which render an inline alert). Violates the UI rule 'surface errors in the UI, not only console.'
- **Fix:** Add `catch (e) { this.error = e instanceof Error ? e.message : String(e); }` with an `error = $state('')` field, render it as an inline alert in the generate tab, and clear it at the start of each generate().

#### [P3] Derivation loop duplicated between executor and store with divergent yield constants  `duplication` _(conf:medium)_
- **Where:** executor.ts:55-80 and store.svelte.ts:170-203
- **What:** Both implement the same passphrase→mnemonic→createEvmDeriver→sequential-derive-with-periodic-yield pipeline. They use different magic constants (PROGRESS_EVERY=200 vs YIELD_EVERY=200) and different yield mechanisms (await Promise.resolve() vs setTimeout(0)). Any future correctness fix (e.g. the binary-message handling, or a new chain family) must be made in two places, risking GUI/CLI drift — the very thing the store header comment claims to prevent ('calls the SAME crypto functions').
- **Fix:** Extract `async function deriveBatch(mnemonic, hdPathType, start, count, onProgress)` into crypto/derive.ts (single yield strategy + constant) and have both executor.run and store.generate call it.

### Dead code
- crypto/sign.ts:102 — `value: parseEther('0')` default in signTransaction({...}) is always overwritten by `...parsed.transaction` (which always carries `value` for parsed txs); the default is dead/confusing and, worse, masks intent (see finding on fingerprint). Remove it.
- executor.ts:42-45 + types.ts/schema.ts `addressType` — validated and threaded through ValidatedInput but never consumed by EVM derivation (createEvmDeriver ignores it; EVM only has 'default'). Intentional scaffolding for future chains, but currently an unused input on the v1 EVM-only path.

### Duplication
- Batch-derivation pipeline is duplicated: executor.ts:61-79 (passphraseToMnemonic → createEvmDeriver → for-loop with PROGRESS_EVERY=200 yield via `await Promise.resolve()`) and store.svelte.ts:184-199 (same, with YIELD_EVERY=200 yield via setTimeout(0)). Two copies of the same derive-and-yield loop with divergent constants (PROGRESS_EVERY vs YIELD_EVERY) and yield strategies. Extract a shared `deriveBatch(mnemonic, hdPathType, start, count, onProgress)` async helper in crypto/derive.ts and call it from both, so GUI and CLI cannot drift.
- Strength/entropy estimation appears only in store.svelte.ts (estimateStrength) — single source, OK; no action.


## contract-caller

- **Tests:** partial · **Files reviewed:** 17
- Contract Caller is a read/write/batch/chained-call tool over arbitrary EVM chains: ABI parse + WhatsABI autoload, proxy resolution, eth_call reads with multi-RPC failover, Safe MultiSend batches, and a CREATE2 ChainedMultiSend delegatecall for returndata-forwarding chains (plus a deterministic demo gallery). The encoding/decoding, proxy detection, CREATE2 prediction, and chained-call splice math are correct and well unit-tested. However the headline reliability feature — cross-RPC failover for reads — is effectively broken by a faulty error-classification regex, and that path has no test exercising it. No Promise.race/timers exist in this area, so those CLAUDE.md rules don't apply. Pure helpers (format/abi/encode/demos/chained) have good coverage; the store, network, and failover paths have essentially none.

### Findings

#### [P1] Read failover is dead: transport errors misclassified as non-retryable reverts  `bug` _(conf:high)_
- **Where:** src/lib/contract-caller/rpc-client.ts:43 (used by read.ts:61)
- **What:** isRetryableRpcError classifies an error as a deterministic revert (return false → NO failover) if its joined message matches `/0x[0-9a-f]{8}/`. But viem CallExecutionError.message ALWAYS embeds the request — the `to` address and the calldata selector — e.g. a real timeout/429 on `client.call({to:'0x6b175474…', data:'0x06fdde03'})` yields a message containing both `0x06fdde03` and `0x6b175474…`, each matching `0x[0-9a-f]{8}`. Reproduced locally: a HTTP-429 error string with calldata returns false; a real viem timeout error returns false too. Consequently executeReadWithFailover (read.ts:60-62) short-circuits on `res.retryable === false` after the FIRST endpoint and never tries the other healthy RPCs — defeating the cross-endpoint failover the file header (rpc-client.ts:3-5) promises. Trigger: any read against a flaky/rate-limited/dead primary RPC (the exact failure failover exists to handle). Impact: reads error out with 'HTTP request failed' instead of recovering via another configured RPC. No test covers executeReadWithFailover, and rpc-client.test.ts only feeds hand-built strings without an address/selector, so the suite is falsely green.
- **Fix:** Minimal fix in src/lib/contract-caller/rpc-client.ts:43 — drop the 0x[0-9a-f]{8} alternative from the regex:

  if (/revert|invalid opcode|out of gas|execution failed/.test(msg)) return false;
  return true;

Rationale: real reverts (including custom-error reverts) always contain 'reverted'/'revert' in viem's message (ContractFunctionRevertedError and raw-call 'execution reverted: ...'), so they stay non-retryable. The bare 4-byte-hex match was the only thing misclassifying transport errors, because viem CallExecutionError messages always embed the selector and `to` address.

If a bare custom-error selector ever needs detection (not required here — the keyword already covers it), gate it on a revert/execution context rather than matching any 8-hex anywhere, e.g. only treat a leading return-data selector as a revert when the message also contains 'revert'/'execution'. Do NOT scan the whole message for arbitrary 4-byte hex.

Tests to add (rpc-client/read level):
1. Unit: isRetryableRpcError on a CallExecutionError-shaped object whose message includes `to: 0x6b175474...` and `data: 0x06fdde03` plus 'HTTP request failed.'/'fetch failed' must return TRUE.
2. Integration: executeReadWithFailover with two URLs where the first throws a transport error (message containing address+selector) and the second succeeds — assert it falls over to the second URL and returns ok. (Inject a fake makeClient/transport so no network is needed.)
3. Keep an assertion that a genuine 'execution reverted' still returns retryable:false and short-circuits.

#### [P3] coerceValue accepts out-of-range / mis-sized values for uintN, intN, and bytesN  `bug` _(conf:high)_
- **Where:** src/lib/contract-caller/format.ts:59-77
- **What:** For uint/int the code does `BigInt(s)` with no width or sign check: `coerceValue('uint8', undefined,'-5')` returns -5n and `coerceValue('uint8',…,'999')` returns 999n. For fixed-size bytes it only checks isHex, not length: `coerceValue('bytes32',…,'0x1234')` passes. These are caught later by viem's encodeFunctionData (encode throws), so the user still sees an error rather than a malformed tx — but the inline per-field validateValue (used for live highlighting) reports the value as valid, so the failure surfaces only at send/encode time with a less precise message and no field highlight.
- **Fix:** In coerceValue, after BigInt(): for `uintN`/`intN` parse N and assert range (uint: 0 ≤ v < 2^N; int: -2^(N-1) ≤ v < 2^(N-1)); for `bytesN` assert hex byte length === N. Throw a precise message so validateValue highlights the offending field before send.

#### [P3] Custom RPC URL accepts any scheme; persisted and reused without validation  `security` _(conf:medium)_
- **Where:** src/lib/contract-caller/caller-store.svelte.ts:270-293 (applyCustomRpc) + networks.ts:118-133 (rpcCall)
- **What:** applyCustomRpc takes the raw customRpcInput, POSTs to it via rpcCall, and on success saves it to localStorage (saveRpcChoice) where loadSavedRpc later restores it as rpcUrl for all reads. There is no scheme/host validation (the chain-index extractor enforces https-only, but custom input does not). In a browser the blast radius is limited (CORS, mixed-content blocking of http:// on an https page, no file:/SSRF), so this is low severity, but a pasted http:// or non-https endpoint silently fails under mixed-content, or a typo'd URL gets persisted per-chain. Not exploitable for key/fund theft (reads only; writes go through the wallet with explicit chainId), hence P3.
- **Fix:** In applyCustomRpc, require `new URL(url).protocol === 'https:'` (matching extractRpcUrls) before probing/saving, and surface a clear i18n error otherwise.

#### [P3] Restored custom RPC is trusted on reload without re-verifying its chainId  `bug` _(conf:medium)_
- **Where:** src/lib/contract-caller/caller-store.svelte.ts:245-251, 1038-1045
- **What:** On selectChain, a saved RPC (loadSavedRpc) is adopted as rpcUrl with no re-verification of chainId. applyCustomRpc verifies eth_chainId on first apply, but the restore path does not. If a saved custom RPC later serves a different chain (provider repurposed) or is down, reads/writes target the wrong/dead endpoint until the user manually re-probes. Minor because writes pass an explicit chainId to the wallet and reads would simply error.
- **Fix:** After restoring a saved RPC in selectChain, run a background eth_chainId probe (reuse applyCustomRpc's check) and fall back to findBestRpc if it mismatches or is unreachable, instead of trusting localStorage blindly.

#### [P3] No tests for the store, failover loop, network probing, or chained-execution build path  `test-gap` _(conf:high)_
- **Where:** src/lib/contract-caller/caller-store.svelte.ts, read.ts (executeReadWithFailover), networks.ts (probeRpcs/rpcCall/loadChainInfo)
- **What:** Pure helpers (abi, encode, format, demos registry, chained encoding, proxy bytecode parsing) are well covered. But the orchestration with real failure behavior is untested: executeReadWithFailover's failover order/short-circuit, isChainedDeployed/getDeployedDemos getCode handling, probeRpcs latency/status, loadChainInfo's https filtering, and the entire caller-store (buildChainedCalls ref/placeholder logic, removeFromChain index-shift ref invalidation, write/batch/chain guards). The P1 failover bug exists precisely because this layer has no behavioral test.
- **Fix:** Add vitest coverage with a mocked viem client / fetch for: (1) executeReadWithFailover failing over past a transport error to a healthy URL; (2) buildChainedCalls producing correct returnRefs and placeholders; (3) removeFromChain/moveChain clearing now-invalid refs.

### Dead code
- autoload-abi.test.ts:9-22 — the WhatsABI mock declares loaders the source no longer uses (MultiABILoader, SourcifyABILoader, EtherscanV2ABILoader, FourByteSignatureLookup). autoload-abi.ts uses inline SourcifyV2ABILoader/Sourcify4ByteSignatureLookup + only MultiSignatureLookup/OpenChainSignatureLookup. The extra mock entries are dead test cruft (harmless but misleading).
- rpc-client.ts:43 — the `0x[0-9a-f]{8}` alternative in the retryable regex is also redundant: its only intended case (custom-error reverts like 'reverted with custom error 0x...') is already matched by the `revert` alternative, as the rpc-client.test.ts:17 fixture shows.

### Duplication
- getCode-presence check duplicated: chained-contract.ts:46-54 (isChainedDeployed) and demos/demos.ts:190-207 (getDeployedDemos) both do `const code = await client.getCode(...); return !!code && code !== '0x'`. Extract a shared `isDeployed(rpcUrl, address)` helper in rpc-client.ts and reuse.
- RPC-list dedup duplicated: caller-store readRpcs getter (caller-store.svelte.ts:210-213) dedups with `[...new Set(...)]`, and executeReadWithFailover (read.ts:56) dedups again. Harmless but the second is redundant for store callers; keep one canonical place.
- wallet-write preflight guard `if (!this.selectedChain || (wallet.kind === 'biubiu' && !this.writeNetwork))` is copy-pasted in sendWrite, sendBatch, deployChainHelper, sendChain, deployDemo (caller-store.svelte.ts:499, 615, 744, 827, 910). Extract one `canSubmit(wallet)` guard returning the i18n error key.


## e2e-chat

- **Tests:** partial · **Files reviewed:** 18
- Browser-side E2E chat: ephemeral ECDH P-256 → HKDF-SHA256 → directional AES-256-GCM, driven by a Svelte 5 runes session controller (ChatStore) over a self-healing WebSocket to a blind 2-peer Cloudflare DO relay. The core cryptography is sound: keys are memory-only, GCM nonces are unique per (key,seq), AAD binds room|direction|seq, and the Safety Code (SAS) over the full role-ordered transcript is a correct MITM defense for the joiner's out-of-band key check and the creator's SAS comparison. Overall health is good, but there is one exploitable DoS (a malformed peer public key permanently wedges the creator's session via an unhandled rejection), the SAS is never enforced before plaintext flows, sign-in needlessly forces a chain switch to mainnet, and several error/end states are dead code. Test coverage of crypto and the happy-path state machine is good; adversarial/malformed-input paths and the transport are untested.

### Findings

#### [P2 (was P1)] Malformed peer public key permanently wedges the creator's session (unhandled rejection DoS)  `bug` _(conf:high)_
- **Where:** store.svelte.ts:273-284 (onPeerSignal), invoked via :253 `void this.onPeerSignal(frame.data)`
- **What:** onPeerSignal sets `this.peerHandshake = hs` (line 282) BEFORE `await deriveTrafficKeys(...)` (line 284), and the whole method has no try/catch and is fired with `void`. The handshake `hs` is fully attacker-controlled (a malicious relay or malicious joiner supplies addr/pub/sig/kind). The creator (role 'a') has no expectedPeerPub, so it does not reject a bad key. If `hs.pub` is not a valid raw P-256 point (any garbage base64url), crypto.subtle.importKey/deriveBits inside deriveTrafficKeys rejects → the promise rejects unhandled. Because peerHandshake is already set, the guard at line 274 now blocks any retry, keys stays null, and phase never advances past 'handshaking'/'waiting'. Result: the creator is stuck on a spinner forever with no error surfaced — a one-frame denial of service against every room the creator opens. This is exactly the CLAUDE.md 'unhandled rejection' + 'non-critical errors must not break main flow' lesson.
- **Fix:** Root cause: onPeerSignal (store.svelte.ts:273-306) (a) runs with no rejection handling, and (b) commits `this.peerHandshake = hs` (line 282) BEFORE the awaitable that can reject (line 284 deriveTrafficKeys), so a rejecting derive both leaks an unhandled rejection AND poisons the :274 guard so no retry can ever succeed.

Minimal fix (two required changes + one optional hardening):

1) Move the guard-poisoning assignment to AFTER the crypto succeeds. Delete line 282 (`this.peerHandshake = hs;`) and instead set it only once keys + safety + peer are computed (e.g. right before `this.phase = 'connected'` at line 304). This way a failed derive leaves peerHandshake null, so a subsequent legitimate signal can still connect.

2) Wrap the awaited body in try/catch so the rejection is handled, not unhandled:
   private async onPeerSignal(hs: Handshake): Promise<void> {
     if (this.peerHandshake || !this.myEph || !this.myHandshake || !this.roomId || !this.role) return;
     if (this.expectedPeerPub && hs.pub !== this.expectedPeerPub) { this.fail('tampered'); return; }
     try {
       const keys = await deriveTrafficKeys(this.myEph.privateKey, hs.pub, this.roomId);
       // ...compute safety + peer using local consts...
       this.keys = keys;
       this.peerHandshake = hs;   // commit guard only on success
       this.phase = 'connected';
       this.flushOut();
     } catch {
       // malformed/garbage peer key — drop this signal, stay open for a valid one
       return;
     }
   }
   Dropping silently (mirroring onRelay's catch at :328-329 "forged or corrupt frame — drop silently") is preferable to fail('tampered') here, because fail() lets a single malicious joiner force the creator into a terminal error phase — still a DoS, just a different state. Since the room is 2-peer capped and a malicious joiner already holds a slot, neither is perfect, but "drop + remain waiting" is the least-bad and matches the existing relay-frame handling.

3) Optional defensive validation before importing (cheap, avoids relying on WebCrypto's error): decode hs.pub and require exactly 65 bytes with a 0x04 (uncompressed point) prefix; bail early if not. Also guard the base64 decode itself (atob throws InvalidCharacterError on non-b64), which the try/catch already covers.

Also add a regression test in store.test.ts: deliver a `signal` frame with `pub:'!!!'` (and one with a 65-byte off-curve point) to the creator, assert phase does NOT advance to an unrecoverable spinner and that a subsequent valid signal still reaches 'connected'.

#### [P2] Sign-in forces a wallet network switch to Ethereum mainnet for a purely off-chain challenge  `logic` _(conf:high)_
- **Where:** store.svelte.ts:34 (CHALLENGE_CHAIN_ID=1) + :206 wallet.signMessage(challenge,{chainId:1}); eip1193-base.ts:214-220 signMessage→ensureChain
- **What:** prepareIdentity signs the chat challenge with {chainId: 1}. For external EIP-1193 wallets, signMessage() first calls ensureChain(1), which issues wallet_switchEthereumChain to mainnet. The chainId here is only a domain separator embedded in the message text — no transaction is sent — yet the user connected on (say) Base/Arbitrum is forced to approve a mainnet switch just to start a chat, or the switch throws. The throw is swallowed by the catch at store.svelte.ts:212 and the user silently drops to anonymous, losing the verified-identity badge with no explanation. Surprising side effect + silent identity loss.
- **Fix:** Don't bind sign-in to a real chain switch. Either pass the wallet's current chainId to signMessage (read it instead of forcing 1), or have the wallet backend skip ensureChain for pure message signing (personal_sign is chain-agnostic). At minimum, surface a clear notice when the signature path fails rather than silently going anonymous.

#### [P2] Safety Code (SAS) is never enforced — plaintext flows before any MITM check  `security` _(conf:medium)_
- **Where:** ChatRoom.svelte:90-107 (passive trust bar) + store.svelte.ts:304 phase='connected' set immediately after derive
- **What:** The SAS is the sole MITM defense for the creator side (and the joiner side beyond the link-key check). But the UI reaches 'connected' and lets users send/receive cleartext immediately; the safety code is shown only in a collapsible trust bar that users are never required to compare. A relay performing an active key-substitution MITM produces mismatched SAS on each side, but if neither user proactively compares the code out-of-band, messages are still exchanged (they'd just be re-encrypted by the relay on each leg). This is the documented design, but for a security tool the trust ceremony being optional and silent materially weakens the guarantee.
- **Fix:** At least gate the FIRST outbound/inbound reveal behind an explicit 'Confirm the safety code matches' acknowledgement, or show a persistent unconfirmed-SAS banner until the user taps 'codes match'. Surface the SAS prominently on connect rather than hiding it behind a button.

#### [P2] No timeout/failure surfaced when the relay is unreachable — joiner/creator spin forever  `bug` _(conf:medium)_
- **Where:** transport.ts:78-88 scheduleReconnect (infinite backoff, never gives up) + Chat.svelte:44-45 handshaking StatusView
- **What:** ChatTransport retries forever (capped at 15s) and never reports a terminal failure to the store. If the relay is down or the WebSocket can never open, the creator stays in 'waiting' and the joiner stays in 'handshaking' (a bare spinner) indefinitely with only a small 'reconnecting' hint (and the handshaking view shows no connection state at all). The store never calls fail('connectFailed') for a transport that can't connect — connectFailed is only reachable from a server error frame, which requires a working connection. Users get no actionable error. UI-DESIGN-RULES: errors must surface in the UI.
- **Fix:** Track consecutive failed connect attempts in ChatTransport; after N attempts (or T seconds) before ever reaching 'open', emit a terminal state so the store can fail('connectFailed'). Show connection state on the handshaking screen, not just a spinner.

#### [P3] Receiver has no message-gap detection — a malicious relay can silently drop messages  `security` _(conf:medium)_
- **Where:** store.svelte.ts:320-339 onRelay (only checks seq <= lastRecvSeq)
- **What:** onRelay enforces strict monotonic seq (replay/duplicate protection, good) but accepts arbitrary forward jumps: receiving seq 0 then seq 5 silently skips 1-4. A blind relay can therefore selectively delete messages (e.g., drop a specific reply) with zero indication to either party. AEAD prevents forgery/replay but not deletion. This is an inherent relay-threat limitation, but worth an explicit decision/note since the relay is the declared adversary.
- **Fix:** Optionally detect gaps (expected = lastRecvSeq+1) and show a 'messages may have been dropped' indicator, or include a running message count / per-message ack in the encrypted payload so deletions are detectable. At minimum document the limitation.

#### [P3] Untrusted relay frame fields (seq) used without integer validation  `bug` _(conf:medium)_
- **Where:** store.svelte.ts:255-256, 320-331; crypto.ts:116-122 nonceFor setBigUint64(BigInt(seq))
- **What:** frame.seq from the relay is passed straight into onRelay and into nonceFor via BigInt(seq). seq is never validated as a non-negative safe integer. A non-integer/NaN/negative or >2^64 seq from a malicious relay yields BigInt() throwing (NaN) or a wrapped nonce. The decrypt will fail and the catch at :328 drops it, so impact is limited to a dropped frame (no nonce reuse since the sender controls its own seq). Still, untrusted input crosses the crypto boundary unchecked.
- **Fix:** In onRelay, early-return if !Number.isSafeInteger(seq) || seq < 0 before any crypto. Same hardening on the relay isn't needed (it doesn't read seq), but the client should treat it as untrusted.

#### [P3] Peer wallet address is displayed as identity even when unverifiable (smart-contract wallets)  `security` _(conf:medium)_
- **Where:** store.svelte.ts:297-302 (peer.address = hs.addr unconditionally) + ChatRoom.svelte:81-106
- **What:** For smart-contract wallets, verifyPeer returns false (no on-chain ERC-1271 check is attempted even though wallet.verifyMessage exists in the wallet abstraction). The peer's claimed address (hs.addr, attacker-chosen) is still shown in the header, flagged only with a small '⚠ unverified' pill. A malicious peer can present ANY address (e.g. a well-known one) with a bogus sig; the SAS still binds the sig so a MITM can't swap it, but a directly-connecting impostor can display a spoofed address that a user may trust despite the subtle warning. The 'verified' EOA path is correct; the SC path leans entirely on the unverified label.
- **Fix:** For SC wallets, either attempt wallet.verifyMessage (on-chain ERC-1271) before showing the address, or suppress the address entirely when unverified (show only the avatar/SAS). Make the unverified state visually unmistakable, not a subtle pill next to a real-looking address.

#### [P3] Unreachable error/end states with full UI + i18n wiring  `dead-code` _(conf:high)_
- **Where:** store.svelte.ts:45-47 ('noWallet'|'noSign'|'signFailed'), :51 ('overflow'); ChatLanding.svelte:42-43,49-54
- **What:** ErrorCode 'noWallet'/'noSign'/'signFailed' and EndReason 'overflow' are declared and have rendering branches + 15-locale i18n keys, but no code path ever assigns them (anonymous-by-default means sign-in is never required; relay overflow maps to endReason='peer'). Dead branches plus translation maintenance burden across all locales.
- **Fix:** Remove the three unused ErrorCode members and the 'overflow' EndReason, delete the corresponding ChatLanding branches, and drop the orphaned i18n keys (chat.error.noWallet/noSign/signFailed, chat.ended.overflowTitle) from all 15 locale files.

#### [P3] Hand-synced protocol mirror has already drifted between client and relay  `coupling` _(conf:medium)_
- **Where:** apps/biubiu.tools/src/lib/e2e-chat/protocol.ts vs apps/chat.biubiu.tools/src/protocol.ts
- **What:** Both files carry a 'Keep in sync' warning and duplicate the entire wire protocol. They already diverge (client: signal/ServerSignal.data: Handshake; relay: data: unknown). Future shape changes risk silent routing breakage because nothing enforces parity. Per AI-CODING-RULES (no duplicate logic).
- **Fix:** Promote the protocol to a shared workspace package imported by both apps, or generate one from the other. If kept separate, add a test that asserts structural equivalence of the two type sets.

### Dead code
- store.svelte.ts:45-47 — ErrorCode values 'noWallet' | 'noSign' | 'signFailed' are never assigned anywhere (fail() is only ever called with 'roomFull' | 'tampered' | 'connectFailed'). They are anonymous-by-default leftovers; their i18n keys (chat.error.noWallet/noSign/signFailed) and the ChatLanding.svelte errorMsg switch branches (lines 49-54) are unreachable.
- store.svelte.ts:51 — EndReason value 'overflow' is never assigned (endReason is only set to 'self', 'peer', or null). The relay's buffer-overflow/grace-expired drop sends peer-left graceful:true, which maps to endReason='peer', never 'overflow'. ChatLanding.svelte:42-43 (chat.ended.overflowTitle branch) and the i18n key are dead.
- crypto.ts:116-122 — nonceFor comment claims a '4B dir tag' but only iv[0] is ever set (bytes 1-3 stay zero). Not a security bug (direction also separates the key, seq is unique per key) but the comment is misleading vs. the implementation.

### Duplication
- protocol.ts (apps/biubiu.tools/src/lib/e2e-chat/protocol.ts) and apps/chat.biubiu.tools/src/protocol.ts are hand-maintained mirrors of the same wire protocol (both carry a '⚠️ Keep in sync' banner). They have already drifted: the client types signal.data as Handshake while the relay types it as unknown. A drift in frame shapes will silently break routing/parsing. Consider a tiny shared workspace package or a single source of truth — the 'keep in sync by hand' note is a known smell.
- Address-shortening logic is duplicated: ChatRoom.svelte:24-26 shorten() and ChatLanding.svelte:21 shortAddr both implement the same `${a.slice(0,6)}…${a.slice(-4)}` truncation. Extract one helper (e.g. in relay.ts or a ui util) and reuse.


## wallet (abstraction+backends)

- **Tests:** good · **Files reviewed:** 27
- The wallet layer is a clean, well-documented `ConnectedWallet` abstraction over four backends (biubiu passkey-Safe, inject/EIP-6963, walletpair, shared EIP-1193 base) plus a direct-fetch RPC/bundler infra ported from vela-wallet. Core flows are unusually well covered by unit tests (gate, send single/batch, sign/verify, walletpair lifecycle, MultiSend byte-parity), and the smart-contract-wallet gate is correctly enforced at every external connect entry point AND re-checked per-chain before each send. No exploitable auth-bypass or gate-bypass was found: the gate's `eth_getCode` trust boundary is the user's own wallet (not an external attacker), and the security-sensitive verify paths (e2e-chat sign-in, member-proof) do NOT use this layer's ERC-1271 `verifyMessage` (that is consumed only by the debug panel). Real issues are limited to a handful of robustness/correctness gaps (Promise.race timer in receipt polling is fine, but receipt polling has no AbortController so failed fetches keep firing; bundler RPC selection can forward a dead URL) and a meaningful pile of dead exports in infra. Overall health: good.

### Findings

#### [P2] Receipt/batch polling loops never abort in-flight fetches on timeout — leaked requests + ignored rejections after a hung send  `perf` _(conf:high)_
- **Where:** eip1193-base.ts:182-211 (waitForCallsStatus, waitForReceipt)
- **What:** Both polling loops do `await provider.request(...)` then `await sleep()` in a `while (Date.now()-start < 180_000)` loop. There is no AbortController and no per-request timeout. If the provider's `request` hangs (a stalled WalletConnect/walletpair relay socket, or a wallet that never answers `wallet_getCallsStatus`), the loop is stuck on a single await that may never resolve — the 180s wall-clock guard is only re-checked between awaits, so a single hung request bypasses the timeout entirely and the send promise never settles, leaving the UI stuck in the 'waiting' phase forever. Even in the normal case, each poll iteration's request is fire-and-forget with respect to cancellation: if the outer flow is later abandoned there is no way to stop the polling.
- **Fix:** Wrap each provider.request in a bounded race with an AbortController-backed timeout (clearTimeout in both branches, .catch(()=>{}) the loser per the CLAUDE.md Promise.race rules), e.g. a `requestWithTimeout(provider, args, POLL_INTERVAL_MS*3)` helper; on timeout treat as a transient poll miss and continue until the 180s wall-clock guard fires. This guarantees the overall timeout is honored even when a single request hangs.

#### [P2] pickBundlerRpcUrl can hand the bundler a dead/unreachable RPC URL because reportsChain treats transport failure as 'chain matches'  `logic` _(conf:medium)_
- **Where:** rpc-client.ts:147-158 (reportsChain) + 201-211 (pickBundlerRpcUrl)
- **What:** reportsChain returns `true` on any transport error (can't determine the chain → don't exclude). pickBundlerRpcUrl uses `Promise.any(publicUrls.map(...))` and returns the first URL whose reportsChain resolves truthy. A public endpoint that is simply DOWN (eth_chainId throws) makes reportsChain resolve `true`, so Promise.any can pick a dead URL and forward it to the bundler via X-Rpc-Url. The bundler then fails to reach the chain and the whole send/estimate fails even though a second healthy public endpoint existed. Same logic also lets a wrong-but-unreachable user override slip through in resolveRpcUrls paths. Impact: intermittent send/estimate failures attributed to the bundler, hard to diagnose.
- **Fix:** For the bundler-URL selection specifically, make reportsChain’s success the discriminator: have the per-URL probe actually require a successful eth_chainId that equals chainId (throw on transport error so Promise.any moves on), and only fall back to publicUrls[0] when ALL probes fail. Keep the lenient 'true on transport failure' behavior only for the failover ranking in rpcCall, not for picking a single URL to disclose to the bundler.

#### [P2] External-wallet accountsChanged disconnect can race with an in-flight send, but a chainChanged that moves the wallet off the target chain is silently ignored  `logic` _(conf:medium)_
- **Where:** wallet-store.svelte.ts:136-147 (watchExternal)
- **What:** watchExternal only listens for `accountsChanged` and disconnects on address change. It does NOT listen for `chainChanged`. Eip1193Wallet.currentChainId is only updated by ensureChain; if the user switches networks directly in their wallet after connecting, currentChainId is stale, so the next sendCalls' `ensureChain` early-returns when target===stale-currentChainId and may NOT actually be on that chain — the per-chain gate re-check still runs via this.provider so a non-smart-account chain is caught, but a transaction can be dispatched on a chain the wallet silently moved to if the stale id happens to equal opts.chainId. Combined: accountsChanged firing mid-send tears down the listener and nulls `external` while a sendCalls promise is still resolving against the old wallet instance (the in-flight call keeps its own `wallet`/`this.provider` reference, so it completes against the now-disconnected account).
- **Fix:** Also subscribe to `chainChanged` and update the wallet's currentChainId (or force a re-ensureChain) so ensureChain can't short-circuit on a stale id; and have sendCalls re-read chainId from the provider (eth_chainId) right before signing rather than trusting cached currentChainId. The accountsChanged teardown is acceptable but document that in-flight sends intentionally complete against the captured instance.

#### [P3] ERC-1271 verifyMessage/verifyTypedData verify against the shared RPC pool, not the connected wallet's chain/provider — can report a false 'invalid' for counterfactual or non-pool chains  `logic` _(conf:medium)_
- **Where:** eip1193-base.ts:256-292 (verifyErc1271, verifyMessage, verifyTypedData)
- **What:** verifyErc1271 calls `rpcCall('eth_call', [...], chainId)` using the shared infra RPC pool keyed by opts.chainId, instead of the wallet's own `this.provider`. If the external wallet is on a chain not in the built-in CHAINS table (or the user's override pool can't serve it), rpcCall throws 'No RPC endpoint configured' → ok:false; and if the smart account is counterfactual/undeployed on that chain, eth_call to a non-existent contract returns 0x → valid:false even for a structurally valid signature. This is only reachable from the debug SignPanel (no security gate depends on it), so impact is a misleading debug result, not an auth issue.
- **Fix:** Route the read through the wallet's own provider (this.provider.request('eth_call', ...)) so verification uses the same node the signature was produced against; fall back to rpcCall only if the provider lacks eth_call. At minimum surface a distinct 'account not deployed / chain unreachable' detail instead of a flat 'invalid'.

#### [P3] Several infra exports have zero callers across the entire app  `dead-code` _(conf:high)_
- **Where:** currency-catalog.ts:52, chains.ts:153, providers.ts:80, endpoints.ts:110
- **What:** `currencyName()`, `isSupportedChain()`, `providerChainIds()`, and `subscribeServiceNodes()` are all exported public functions with no consumer anywhere in src or routes (verified by repo-wide grep). They were ported speculatively from vela-wallet. Per AI-CODING-RULES (no dead code / no speculative abstraction) they should be removed until a consumer exists.
- **Fix:** Delete the four functions (and `subscribeServiceNodes`'s CHANGE_EVENT plumbing if nothing else dispatches/handles it — saveServiceNodeSettings still dispatches the event but with no listeners it is also dead). Re-add when a Settings UI actually needs same-tab reactivity / per-provider chain lists.

#### [P3] JSON-RPC POST + RpcResponse envelope duplicated between rpc-client and bundler-client  `duplication` _(conf:high)_
- **Where:** rpc-client.ts:118-137 + bundler-client.ts:16-50
- **What:** Both modules declare an identical `RpcResponse<T>` interface and implement the same fetch→res.ok check→json parse→json.error unwrap→return json.result sequence. The bundler version additionally lacks the AbortController/timeout that rpc-client has, so a hung bundler POST in bundler-client.ts:38 has no timeout at all (unlike bundler-account.ts which does use a timeout).
- **Fix:** Extract a shared `jsonRpcPost(url, method, params, { signal, headers })` returning `result` or throwing RpcError, used by tryEndpoint and bundlerCall. This also fixes the missing timeout on eth_sendUserOperation/eth_estimateUserOperationGas by giving bundlerCall the same AbortController treatment.

#### [P3] Hardcoded rgba border color in WalletGate forever-theme (theme-token violation)  `ui-design` _(conf:medium)_
- **Where:** WalletGate.svelte:56 `border-color: rgba(184, 134, 47, 0.22);`
- **What:** UI-DESIGN-RULES forbids hardcoded rgba/hex for borders because they don't adapt to light/dark. The forever-theme overrides --accent locally but then hardcodes a gold border rgba instead of deriving it. It's a deliberate accent theme so the visual impact is small, but it's the one token violation in this area.
- **Fix:** Use `border-color: color-mix(in srgb, var(--accent) 22%, transparent);` (the theme already overrides --accent to the gold), keeping it theme-correct.

#### [P3] getCapabilities accepts the provider's capabilities object verbatim with no shape validation  `logic` _(conf:low)_
- **Where:** eip1193-base.ts:243-253
- **What:** getCapabilities returns whatever the wallet hands back as `Record<string, unknown>` (or {} on error). It's only used by the debug CapabilitiesPanel to render, so a malicious/buggy wallet returning a huge or hostile object is low risk, but it is unvalidated data crossing a trust boundary (the external wallet) that flows into UI rendering. Worth noting since the abstraction is designed to be the single point all tools rely on.
- **Fix:** If any non-debug flow ever gates behavior on capabilities, validate the shape (e.g. coerce to a known {atomicBatch?:{supported:boolean}} subset). For now, a JSDoc note that the return is untrusted is sufficient.

### Dead code
- currency-catalog.ts:52 `currencyName()` — exported, zero callers anywhere in src/routes (the currency picker uses i18n/Intl, not this).
- chains.ts:153 `isSupportedChain()` — exported, zero callers in the whole app.
- providers.ts:80 `providerChainIds()` — exported, zero callers; ServiceNodesModal renders providers from CHAINS+PROVIDERS, never this helper.
- endpoints.ts:110 `subscribeServiceNodes()` — exported same-tab change subscription, zero subscribers anywhere (ServiceNodesModal does not subscribe).
- index.ts:13 re-exports `Eip1193Wallet` as a value but no consumer imports it as a value (only `InjectWallet`/`WalletPairWallet` subclass it internally, and consumers use the `ConnectedWallet` type) — the value re-export is unused.
- index.ts:6/14 re-export `networkKeyForChainId`, `classifyAccount`, `isSmartAccountOnChain`, `NotSmartAccountError` from the barrel, but every actual consumer imports them from their source module or uses them only inside the wallet package — the barrel re-exports of these four are unused.
- bundler-account.ts:34-37 `SponsorResult.reason` and the `status` field on `BundlerAccountInfo` are populated but never read by any consumer (informational-only, per the comment) — candidate to drop.

### Duplication
- JSON-RPC POST + RpcResponse envelope is implemented twice: rpc-client.ts:118-137 `tryEndpoint` and bundler-client.ts:32-50 `bundlerCall`. Both define an identical local `RpcResponse<T>` interface and do the same fetch/parse/error-unwrap. Extract a shared `jsonRpcPost(url, method, params, {signal})` helper and have both call it (bundler keeps its own URL+header logic, RPC keeps failover).
- `X-Rpc-Url` header assembly (await pickBundlerRpcUrl + conditional header set) is duplicated three times: bundler-client.ts:33-36, bundler-account.ts:72-74, bundler-account.ts:143-145. Extract `bundlerHeaders(chainId, base)` returning the merged headers.
- The 6h/5min FX cache pattern (in-memory `_cache` + `_inflight` dedupe + localStorage persist + `loadPersisted` fallback) is duplicated almost verbatim between fiat-fx.ts:23-96 and fiat-chainlink.ts:88-179. A small `makeCachedFetcher(key, ttl, fetcher)` would remove ~40 lines of parallel logic.
- `receiptOk` (eip1193-base.ts:305) and `isDeployed`'s code check (account-state.ts:17-20) and the gate's code prefix logic each re-implement chain-status string normalization; minor, only receiptOk is worth noting.


## wallet-debug

- **Tests:** none · **Files reviewed:** 17
- Wallet Lab is a read-only debug console over the shared `ConnectedWallet` abstraction (sign/verify message + typed data, getCapabilities, balance/code checks, atomic-batch builder, network switch/add, rolling JSON log). It is purely client-side; all state-changing actions are delegated to the wallet backends, so there is no auth/IDOR/secret surface of its own. Code quality is high and token-/i18n-correct (all 15 locales key-complete, all 98 keys used+defined, no XSS via {@html}). The main weaknesses are coupling (the UI repeatedly duck-types backend-only members `chainId`/`ensureChain`/`provider` that are not on the `ConnectedWallet` interface), a couple of cross-wallet correctness mismatches (MultiSend preview shown for external wallets that never use MultiSend; "Add chain" routes to a random injected wallet when biubiu is active), some dead code/duplication, and zero tests for any of the panels' logic.

### Findings

#### [P2] Debug UI reaches past ConnectedWallet to backend-only members (chainId / ensureChain / provider) via unsafe casts  `coupling` _(conf:high)_
- **Where:** helpers.ts:108-113 (resolveAddProvider), WalletDebug.svelte:31-33, StatePanel.svelte:17-19, NetworkPanel.svelte:52-65 (pickCurated)
- **What:** `ConnectedWallet` (wallet/types.ts) does NOT declare `chainId`, `ensureChain`, or `provider`; these exist only on the `Eip1193Wallet` subclass (eip1193-base.ts:73,78,64). The wallet-debug panels access them through `'chainId' in w` / `'ensureChain' in wallet` / `'provider' in wallet` runtime checks plus `as unknown as { provider }` / `as { chainId: number }` casts. This defeats the abstraction the whole `$lib/wallet` layer was built to provide: if a future backend renames `currentChainId`/`ensureChain` or the cast shape drifts, TypeScript will NOT catch it (casts silence the compiler) and the debug UI will silently read `undefined`/no-op at runtime. The store itself sets the precedent (wallet-store.svelte.ts:138) but at least casts to the typed `Eip1193Provider`.
- **Fix:** Add optional, typed members to the `ConnectedWallet` interface that the debug UI legitimately needs: `readonly chainId?: number` and `ensureChain?(chainId: number): Promise<void>` (already implemented by Eip1193Wallet, absent on biubiu — exactly the optional-method pattern already used for signMessage/getCapabilities). Then the UI can do `wallet.ensureChain?.(id)` / `wallet.chainId` with full type safety and drop every `in`-check and `as unknown as` cast.

#### [P2] MultiSend 'preview' is shown for external wallets that never use MultiSend  `logic` _(conf:high)_
- **Where:** TxBuilderPanel.svelte:95-106 (togglePreview) + i18n key wd.tx.previewNote ('MultiSend calldata the Safe will delegatecall.')
- **What:** The TxBuilder panel is wallet-agnostic (it calls the generic `wallet.sendCalls`), but `togglePreview()` unconditionally renders `encodeMultiSend(build())` — the biubiu/Safe-specific encoding — and labels it 'MultiSend calldata the Safe will delegatecall.' For an inject/walletpair (Eip1193Wallet) connection, a single call goes via `eth_sendTransaction` and multiple via EIP-5792 `wallet_sendCalls` (eip1193-base.ts:111-119) — never MultiSend, never a Safe delegatecall. So a user debugging an external wallet sees calldata and a description that do not correspond to what will actually be broadcast, which is misleading in a tool whose entire purpose is to show what the wallet really does.
- **Fix:** Gate the preview on biubiu: only show the MultiSend preview/note when `wallet?.kind === 'biubiu'` (mirroring the `isBuiltin` pattern already used in SignPanel/CapabilitiesPanel), or branch the preview to show the EIP-5792 `wallet_sendCalls` payload for external wallets.

#### [P2] 'Add chain' targets a random injected wallet when biubiu is the active wallet  `logic` _(conf:medium)_
- **Where:** NetworkPanel.svelte:68-92 (addChain) → helpers.ts:108-113 (resolveAddProvider)
- **What:** biubiu is a chainless passkey Safe with no `provider`. When biubiu is active and the user clicks 'Add' on a searched chain, `resolveAddProvider(wallet)` falls through to `getInjectedProvider()` (helpers.ts:112) and fires `wallet_addEthereumChain`/`wallet_switchEthereumChain` at whatever browser-injected wallet happens to exist (e.g. MetaMask) — a wallet entirely unrelated to the connected biubiu account. The user thinks they're configuring 'their' wallet but are silently driving a third-party extension; if none is installed they get a `no-wallet` log with no clear UI explanation of why. This is a confusing cross-wallet action in a debug tool.
- **Fix:** In addChain, when `wallet?.kind === 'biubiu'` either hide the 'Add' button (biubiu can't have chains added — it's chainless and reads via the RPC pool) or surface an inline note that 'Add to wallet' only applies to external EIP-1193 wallets; do not silently fall back to an unrelated injected provider.

#### [P3] Non-numeric gas-override input throws a cryptic BigInt error and logs a misleading sendCalls failure  `bug` _(conf:high)_
- **Where:** TxBuilderPanel.svelte:87-93 (gasOverrides) called at line 156 inside send()
- **What:** `gasOverrides()` does `BigInt(callGasLimit.trim())` / `parseGwei(maxFeeGwei.trim())` with no validation. If the user opens the optional gas section and types non-numeric text (e.g. 'abc') into the gas-limit field, `BigInt('abc')` throws a SyntaxError. The call is inside send()'s try (line 151-167) so it is caught — but the surfaced `err` is the raw 'Cannot convert abc to a BigInt' string, and the catch also calls `debug.push('sendCalls', false, …)`, logging a sendCalls FAILURE even though no transaction was ever attempted (the throw happened while building the argument object). The console log is therefore misleading.
- **Fix:** Validate the gas fields in `gasOverrides()` and either ignore garbage or throw a localized error BEFORE entering the send try-block (mirror the `build()` validate-then-send pattern), so bad input produces a clear field-level message and does not record a phantom sendCalls failure.

#### [P3] CopyButton / NetworkPanel timers not cleared on unmount  `perf` _(conf:medium)_
- **Where:** CopyButton.svelte:13-24 (timer), NetworkPanel.svelte:85-88 (addedChain setTimeout)
- **What:** `CopyButton`'s 1200ms `timer` and NetworkPanel's 1500ms `addedChain` reset timer are never cleared on component destroy. If the component unmounts within the window, the callback fires and assigns to a `$state` of a torn-down component. In Svelte 5 runes this is a harmless no-op (the closure-captured state still exists), so impact is minimal — but it is the kind of timer-lifecycle slip the project's CLAUDE.md explicitly calls out, and CopyButton is reused widely.
- **Fix:** In CopyButton, clear the timer in `$effect`'s cleanup (`return () => clearTimeout(timer)`); for NetworkPanel, the optimistic reset is fine but could be made cancel-safe the same way. Low priority.

#### [P3] Unused Btn 'danger' variant and 'submit' type  `dead-code` _(conf:high)_
- **Where:** Btn.svelte:8 (variant type), Btn.svelte:96-100 (.btn.danger CSS), Btn.svelte:9 (type:'submit')
- **What:** `variant="danger"` is never used anywhere in wallet-debug (grep returns none), yet the union member and a full `.btn.danger` style block ship. The `type='submit'` option is also never exercised (no <form>). Speculative/unused surface — the project rules call out 'no dead code, no speculative abstraction'.
- **Fix:** Drop the `danger` variant from the union and remove the `.btn.danger` CSS block; remove the `submit` option from the `type` prop unless a form is planned. (If kept intentionally as a shared kit, document why.)

#### [P3] Optimistic selectedChainId set before ensureChain can leave UI target ahead of wallet chain  `logic` _(conf:medium)_
- **Where:** NetworkPanel.svelte:52-65 (pickCurated)
- **What:** pickCurated sets `debug.selectedChainId = chainId` (line 53) BEFORE awaiting `wallet.ensureChain(chainId)`. If the user rejects the wallet's switch prompt, the target chip and StatePanel 'target chain' now show the new chain while the wallet remains on the old one. This is non-fatal: reads (eth_getBalance/estimateGas) go through the chainId-keyed RPC pool (rpc-client.ts) independent of the wallet, and sendCalls re-calls ensureChain internally — but StatePanel will display a target/walletChain mismatch with no indication the switch was rejected.
- **Fix:** Set `debug.selectedChainId` only after `ensureChain` resolves (or revert it in the catch), so the displayed target reflects the actual wallet chain when an ensureChain backend is present. For biubiu (no ensureChain) the immediate set is correct.

### Dead code
- Btn.svelte:8,96-100 — `danger` variant (and its `.btn.danger` CSS block) is never used by any panel; `variant="danger"` appears nowhere in wallet-debug.
- Btn.svelte:8 — `type` prop supports 'submit' but no Btn is ever rendered as a submit button (no <form> in the area); the prop's submit path is unexercised.
- helpers.ts:154 — `export { isAddress }` is a thin pass-through re-export of viem's isAddress (only consolidates imports); borderline, but it adds an indirection layer with no added behavior.

### Duplication
- Spinner is defined twice with identical geometry/animation: Btn.svelte:101-122 (`.spinner` + `@keyframes spin` + reduced-motion override) duplicates controls.css:132-159 (`.wd-spinner` + `@keyframes wd-spin` + reduced-motion override). controls.css's own header comment claims it centralizes 'spinners'. Extract one shared spinner (use `.wd-spinner` inside Btn, or a single keyframe).
- Letter-avatar fallback duplicated within NetworkPanel.svelte: `.dot` (212-221, curated-chip logo fallback) and `.res-fallback` (268-282, search-result logo fallback) are both circular 3-char letter avatars with the same fallback intent and near-identical styling. Extract one shared avatar class.
- chainId/ensureChain/provider duck-typing logic is repeated across helpers.ts:108-113, WalletDebug.svelte:31-33, StatePanel.svelte:17-19, NetworkPanel.svelte:54-56 — the same `'x' in wallet` + cast pattern in 4 places (see coupling finding); centralizing it into the abstraction removes the repetition.


## updown-shared

- **Tests:** partial · **Files reviewed:** 31
- Shared library for BTC/ETH Up/Down prediction dashboards: REST API client, pure formatters/labels, SSE manager, FetchCoordinator, a reactive DashboardStore, a WebAuthn passkey auth system (endpoint-store + passkey-client + engine-client) plus a separate sign-control path, a large strategy ConfiguratorDrawer, and ~7 presentational Svelte components. Pure functions (formatters/labels/api) are well-tested; stores, SSE, and the entire auth/passkey surface have zero tests. Code quality is generally good, but there is a real type+runtime bug (signal_rules), a half-hour-timezone hourly-data bug, dead code, and two parallel formatter systems duplicated against updown-v2. Overall health: solid but with a few concrete bugs and notable duplication.

### Findings

#### [P2 (was P1)] RoundsHistory references Round.signal_rules which does not exist on the type → V80 details never render + 2 type-check errors  `bug` _(conf:high)_
- **Where:** src/lib/updown-shared/components/RoundsHistory.svelte:188-189
- **What:** Line 188 gates the V80 dual-sweep block on `round.signal_action === 'v80_dual_sweep' && round.signal_rules`, and line 189 does `JSON.parse(round.signal_rules)`. The Round interface (types.ts:66-95) has no `signal_rules` field, and store.rounds is typed Round[] (no cast). svelte-check reports two hard ERRORS here ("Property 'signal_rules' does not exist on type 'Round'"). At runtime `round.signal_rules` is always undefined, so the entire V80 decision-log / per-direction PnL UI is dead — it can never display even when the backend returns the data. Either the field name is wrong (mismatched with the API column) or the type is missing the field.
- **Fix:** Add the missing field to the `Round` interface in src/lib/updown-shared/types.ts (between `signal_action` and `skip_reason`, around line 84-85), matching the API/DB column exactly:

  signal_rules: string | null;

Do NOT rename the template field — `signal_rules` is the authoritative name (DB column database.ts:42, repo type round-repo.ts:35, scheduler writes scheduler.ts:1683/2068). Renaming to signal_data/v80_log would break the working runtime feature.

After adding the field, re-run svelte-check; the two errors at RoundsHistory.svelte 188/189 disappear. Note the V80 block already renders correctly at runtime today (the JSON flows through raw via res.json() over SELECT *), so this is a type-safety/CI fix, not a functional repair.

#### [P2] fetchHourly produces fractional hour keys for half-hour timezones, silently dropping all hourly data  `bug` _(conf:high)_
- **Where:** src/lib/updown-shared/api.ts:150-154
- **What:** `const offsetHours = new Date().getTimezoneOffset() / -60;` then `hour: (((h.hour + offsetHours) % 24) + 24) % 24`. For UTC+5:30 (India), UTC+5:45 (Nepal), UTC+9:30 (Adelaide) etc., offsetHours is 5.5 / 5.75 / 9.5, so the resulting `hour` is fractional (e.g. 14.5). HourlyChart builds `hourlyMap = new Map(hourlyData.map(h => [h.hour, h]))` and looks up integer hours via `hourlyMap.get(hour)` (HourlyChart.svelte:21,33-34). Fractional keys never match integer lookups, so users in half-hour timezones see a completely empty hourly chart with no error.
- **Fix:** Send the integer minute offset to the backend (like fetchStats/fetchDaily do via tz_offset) and have the server bucket by local hour, OR if client-side shifting must stay, round/floor offsetHours to an integer and accept the ≤1h skew. Do not key a Map on a non-integer hour.

#### [P2] Engine write operations: WebAuthn signature is not bound to the operation payload (potential payload-swap / replay if server doesn't bind challenge)  `security` _(conf:medium)_
- **Where:** src/lib/updown-shared/auth/passkey-client.ts:266-298 (signedFetch) and signOperation:199-259
- **What:** signedFetch obtains a signature via signOperation (which signs only the server-issued opaque `challenge`) and then POSTs `{ payload, signature }`. The signed material (authenticatorData + clientDataJSON, where clientDataJSON contains only the challenge) does NOT cover `payload`. So the signature attests 'a valid passkey approved *something*', not 'approved THIS create/start/stop/delete with THESE params'. If the endpoint server validates the signature against the challenge but trusts `payload` independently, an attacker with a captured request (or an XSS foothold) can reuse one fingerprint approval to perform a different/elevated mutation (e.g. swap a 'pause' payload for a 'createInstance' with large entryAmount, or delete a different instanceId). Impact = trading-key control bypass. Note: sign-control.ts:31 does better — it bakes action:strategyId:timestamp into the message that is signed. The engine-client/signedFetch path does not.
- **Fix:** Bind the operation to the signature: derive the WebAuthn challenge from a hash of the canonical operation (method + path + payload + nonce/timestamp), like sign-control.ts does, instead of a context-free server challenge; and have the server recompute and compare. At minimum, document and verify server-side that the challenge is single-use and that payload is re-derived from signed content, not trusted from the body.

#### [P2] StrategyControlPanel edit flow discards the instance's real config (windows/direction/exit), always resetting to hardcoded defaults  `logic` _(conf:medium)_
- **Where:** src/lib/updown-shared/components/StrategyControlPanel.svelte:386-396
- **What:** When editing an existing instance, ConfiguratorDrawer is fed `initialConfig` built from only a few overrides (entryAmount, priceMax, hedge fields). Entry windows are hardcoded to `[{window:1,start:220,end:190}]`, direction to `clob_follow`, and exit to `[{type:'settlement'}]` regardless of what the instance actually runs. On save, handleConfiguratorSave maps these back to overrides, so opening 'Edit' and clicking Save silently overwrites the instance's entry windows / direction / exit rules with defaults the user never chose. Data-loss-by-edit.
- **Fix:** Fetch the instance's full StrategyConfigV2 (or store it in overrides) and pass the real config as initialConfig, instead of reconstructing a partial one with hardcoded windows/direction/exit. If full config isn't available from the engine, gate the editor to only the fields that round-trip safely.

#### [P2] "Shared" dashboard store hardcodes BTC + a direct Polymarket fetch, breaking ETH/other-market reuse  `coupling` _(conf:high)_
- **Where:** src/lib/updown-shared/stores/dashboard-store.svelte.ts:454-469 (fetchPriceToBeat)
- **What:** DashboardStore is documented as 'Reusable across BTC, ETH, or any prediction market dashboard,' but fetchPriceToBeat hardcodes `symbol=BTC` and a fixed 5-minute window (`/300`) against `https://polymarket.com/api/crypto/crypto-price`. It is also called unconditionally on connect() and on every round_start. For any non-BTC instantiation the price-to-beat will be wrong (BTC's), and the direct cross-origin call (no proxy) will fail/throw on CORS for many deployments (swallowed, so priceToBeat stays null). This couples the generic store to one asset and one venue.
- **Fix:** Inject symbol + window size + a price-to-beat fetcher via DashboardStoreConfig (like getApiOpts/getSseUrl) instead of hardcoding BTC/300/polymarket.com. Make the feature opt-in so non-BTC dashboards don't fire a guaranteed-failing request each window.

#### [P3] HourlyChart uses undefined CSS token --fg-secondary (hour labels get no color)  `bug` _(conf:high)_
- **Where:** src/lib/updown-shared/components/HourlyChart.svelte:172
- **What:** .chart-hour sets `color: var(--fg-secondary);`. No `--fg-secondary` token is defined in src/style/tokens.css or theme-*.css (only --fg-muted/--fg-subtle/--fg-faint exist). With no fallback the property is invalid and the hour digits fall back to inherited color, which may be illegible in one theme. This is the only use of --fg-secondary in the whole repo.
- **Fix:** Replace with a real token, e.g. `color: var(--fg-muted);` (or --fg-subtle to match the AM/PM labels).

#### [P3] EndpointPanel nests a <button> inside a <button> (invalid HTML → SSR/hydration mismatch)  `bug` _(conf:high)_
- **Where:** src/lib/updown-shared/components/EndpointPanel.svelte:139-158 (passkey +K button at 149 inside endpoint-body button at 139)
- **What:** The endpoint row's whole body is a <button class="endpoint-body"> (line 139). Inside it, the '+K' register-passkey control is another <button class="passkey-status unregistered"> (line 149). A button cannot be a descendant of a button; svelte-check warns this will be re-parented by the browser, causing a hydration_mismatch and unreliable click behavior on the inner control (the stopPropagation may not save it once the DOM is restructured).
- **Fix:** Make the outer row a non-button clickable (e.g. a div/li with role+keyhandler, or restructure so the select action and the +K action are sibling buttons rather than nested). Same applies to .btn-remove being a sibling — keep all three as siblings, not nested.

#### [P3] Untrusted JSON (imported file / persisted draft) is cast to StrategyConfigV2 with only a 3-key shallow check  `logic` _(conf:medium)_
- **Where:** src/lib/updown-shared/configurator/ConfiguratorDrawer.svelte:37-49 (loadDraft), 153-167 (applyJson), 181-203 (handleImport)
- **What:** loadDraft, applyJson and handleImport each do `JSON.parse(...)` then validate only `parsed.entry && parsed.direction && parsed.exit` (loadDraft also entry/direction/exit) before `config = parsed as StrategyConfigV2`. No type/range validation of numeric fields, gate shapes, exit-rule types, etc. The resulting config flows into handleConfiguratorSave → InstanceOverrides → engine createInstance/updateInstanceConfig. Since the source is the user's own draft/file this is low severity, but a single shared DRAFT_KEY ('strategy-configurator-draft') across all strategies plus zero validation means a malformed/old-schema draft silently produces an invalid config that may be sent to the trading engine. The engine must defensively re-validate; the client should too.
- **Fix:** Validate the parsed object against the schema (range-check numbers, enum-check method/exit types) before assigning to config, and reject with a surfaced error otherwise. Consider namespacing the draft key per strategy id to avoid cross-strategy draft bleed.

#### [P3] RoundsHistory exit-quality 'goodExit/badExit' badge logic is inverted-looking / fragile  `logic` _(conf:low)_
- **Where:** src/lib/updown-shared/components/RoundsHistory.svelte:175-180
- **What:** `const isCorrectExit = round.real_outcome !== round.entry_direction;` then shows goodExit when real_outcome differs from the entry direction. This labels an early exit as 'good' whenever the final market outcome went against the original entry — which is only correct for stop-loss-style early exits; for a normal settled win (real_outcome === entry_direction) this block is only reached inside the swing_exit_reason branch, but the binary 'correct = different' heuristic ignores the actual exit reason (e.g. take_profit while still on the winning side would be flagged badExit). The judgement of exit quality should depend on exit reason, not just direction comparison.
- **Fix:** Compute exit quality from swing_exit_reason + whether the exit avoided/locked the move, not solely `real_outcome !== entry_direction`. At minimum add a comment justifying the heuristic and confirm it matches stop_loss vs take_profit semantics.

#### [P3] SSE EventSource error path can stack reconnect timers (no in-flight reconnect guard)  `perf` _(conf:low)_
- **Where:** src/lib/updown-shared/sse.ts:57-69 (es.onerror) and 125-130 (connect)
- **What:** On EventSource error, onerror closes es and schedules `setTimeout(connect, 3000)`. connect() calls disconnect() first (which clears connRef.timer), so a single chain is fine. However, a browser EventSource can fire onerror multiple times before close completes, and connectViaProxy's catch path ALSO schedules a 3s reconnect (lines 114-122). If a proxy read loop ends (done) while a separate EventSource error reconnect is also pending, two reconnect timers can coexist briefly because each path writes connRef.timer without checking an existing one. Worst case is redundant reconnect attempts / brief duplicate connections, not a crash.
- **Fix:** Guard timer scheduling with `if (connRef.timer) return;` before setTimeout in both paths, or centralize reconnect through a single scheduleReconnect() that no-ops if a timer is already set.

#### [P3] Entire auth/passkey surface, stores, SSE, and sign-control have no tests  `test-gap` _(conf:high)_
- **Where:** src/lib/updown-shared/auth/*, stores/*, sse.ts, sign-control.ts
- **What:** Tests exist and are good for pure functions (formatters.test.ts, labels.test.ts, api.test.ts cover parsing/formatting). But the security- and reliability-critical pieces have zero coverage: FetchCoordinator (dedup/abort/coalesce — its finally-block 'still active entry' check and abortAll are subtle), DashboardStore (switchStrategy reset, SSE event coalescing), the SSE reconnect state machine, EndpointStore persistence/dedup, base64url round-trip in passkey-client, and sign-control message construction. FetchCoordinator in particular is described as 'fully unit-testable' but isn't tested.
- **Fix:** Add unit tests for FetchCoordinator (abort-on-resubmit, coalesce window, abortAll clears pending) and base64url encode/decode round-trip; add a state-machine test for the SSE manager reconnect/disconnect with a fake EventSource. These are pure/m's-mockable and catch regressions in the riskiest code.

### Dead code
- WeekdayStats interface (src/lib/updown-shared/types.ts:136-146) is exported but never imported anywhere — WeekdayChart.svelte defines its own inline WeekdayAgg interface instead. Remove the unused interface.
- getEventTypeLabel in labels.ts (src/lib/updown-shared/labels.ts:9-38) is referenced only by its own test (labels.test.ts) and is NOT used by any component — LiveFeed.svelte:38-51 hard-codes its own inline duplicate map. The labels.ts version is effectively dead production code.
- Auth exports that are never consumed by any caller: fetchInstanceStatus (engine-client.ts:87) and updateInstanceSchedule (engine-client.ts:145) are exported from auth/index.ts but have zero external call sites; refreshCapabilities (endpoint-store.svelte.ts:136) is also never called. signOperation is exported but used only internally by signedFetch (passkey-client.ts:272).
- SignalConfig type alias (configurator/types.ts:247) is marked @deprecated and is not referenced anywhere — safe to delete.
- ConfiguratorDrawer.svelte has 3 unused CSS selectors flagged by svelte-check: .field-unit (1218), .range-row (1230), .sub-section (1489).

### Duplication
- Two parallel formatter systems for the same domain: updown-v2/utils.ts (fmt/fmtShort/fmtPct/fmtDate/shortDate) reads i18n directly, while updown-shared/formatters.ts (fmtProfit/fmtPct/fmtPrice/...) takes a FormatterContext. updown-v2/formatter-bridge.ts exists only to glue the two together. The btc-updown-5m routes mix both (e.g. instance/+page.svelte imports fmt/fmtPct from updown-v2/utils AND createFormatterCtx from the bridge). Worse, the two fmtPct have DIFFERENT semantics: shared fmtPct(ctx,v) treats v as a fraction (×100 via style:'percent'); v2 fmtPct(v) treats v as already-a-percentage. Consolidate onto one formatter module to avoid the easy-to-misuse divergence.
- getEventTypeLabel is implemented twice: the canonical labels.ts:9-38 (covers v80_* events) and an inline copy in LiveFeed.svelte:38-51 (missing v80_waiting/v80_buy/v80_probe_done). LiveFeed should import the shared function; the inline copy silently shows raw event-type strings for v80 events.
- parseCurrentRound (api.ts:231-246) and the inline 'else' branch of fetchStrategyProfitData (api.ts:316-328) duplicate the same round-status→profit mapping (settled/skipped/entered/watching). Extract a single helper that takes a Round and returns StrategyProfitData['current'] and use it for both the current-round and rows[0] cases.
- glass-card definition + its light-theme override is copy-pasted verbatim into at least 4 components (LiveFeed, RoundsHistory, StatsGrid, WeekdayChart, HourlyChart), as are the .positive/.negative and :global(.badge-win/.badge-loss/.badge-skip) color blocks. These belong in a shared CSS file (updown-v2 already has styles/shared.css) rather than duplicated per component.


## updown-v2

- **Tests:** none · **Files reviewed:** 11
- `src/lib/updown-v2` is the canonical shared layer for the NEW multi-route `/apps/btc-updown-5m` UI: types, mock-data generators, a Svelte-5 rune store, a generic DataTable, route helpers, a formatter bridge, and shared CSS. It is a MOCK/prototype (all data is fabricated, almost every "real" action is a `setTimeout`/`alert`/TODO). It is NOT a duplicate of `updown-shared` — `updown-shared` is the production engine (real API/auth/SSE/charts) used by the older `/apps/btc-updown` page and by v2's two detail routes for chart components. The two coexist deliberately. Overall health: the module is internally coherent and theme-token-driven, but it carries a meaningful block of dead code (a whole parallel auth system in the store that no page uses), one genuinely misleading security-shaped flow (signed pause/resume hitting a real endpoint, while start/stop/delete are unsigned mock no-ops), and zero tests despite ~1k LOC and a hand-rolled sort/filter/paginate component plus seeded PRNG generators that are easy to get subtly wrong.

### Findings

#### [P2 (was P1)] Real engine endpoint POST built from schemeless, mock endpointUrl — request goes to wrong/relative origin  `security` _(conf:high)_
- **Where:** src/routes/apps/btc-updown-5m/space/[spaceId]/instance/[instanceId]/+page.svelte:88-90 / 104-106; endpointUrl from mock.ts:14 ('btc-updown-5m-bot-api.biubiu.tools', no https://)
- **What:** `controlStrategy` is called with `baseUrl: `${endpointUrl}/api/${activeInst.strategyId}`` and then fetches `${baseUrl}/control` (api.ts:217). `space.endpointUrl` in mock is `btc-updown-5m-bot-api.biubiu.tools` — NO scheme. So the fetch URL is `btc-updown-5m-bot-api.biubiu.tools/api/<id>/control`, which the browser resolves as a RELATIVE path against the current origin (e.g. https://biubiu.tools/apps/.../btc-updown-5m-bot-api.biubiu.tools/...). The signed control payload (passkey assertion over `pause:<strategyId>:<ts>`) is thus POSTed to the wrong/same-origin host — at best a 404, at worst it leaks the WebAuthn assertion to an unintended path. The alpha-club mock uses `btc-bot.alpha-club.xyz` (also schemeless) — same issue.
- **Fix:** Normalize and validate endpointUrl to an absolute https origin before constructing baseUrl, and bake the scheme into the data so it cannot be omitted.

1. Store the scheme in the source data (root cause). In mock.ts change endpointUrl to absolute https values: 'https://btc-updown-5m-bot-api.biubiu.tools' and 'https://btc-bot.alpha-club.xyz'. (And when the 'add space' flow is eventually implemented, normalize/validate user input there.)

2. Defensively normalize+validate at the call site in instance/[instanceId]/+page.svelte before sending any signed payload, e.g. a small helper used by both handlePause and handleResume:

   function resolveEndpoint(raw: string): string | null {
     const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
     try {
       const u = new URL(withScheme);
       if (u.protocol !== 'https:') return null; // refuse http / relative
       return u.origin; // strips any accidental path
     } catch { return null; }
   }

   Then:
     const base = resolveEndpoint(endpointUrl);
     if (!base) { /* surface inline error, do not POST the signed assertion */ return; }
     const result = await controlStrategy({ baseUrl: `${base}/api/${activeInst.strategyId}`, fetchFn: fetch }, { action: 'pause', ...signed });

This guarantees the control POST (carrying the WebAuthn assertion) only ever goes to an absolute https origin, never resolves as a same-origin relative path, and the existing legacy normalization pattern (btc-updown-strategies.ts:66-68) is restored for the V2 path. Mirror the change in handleResume (lines 104-106).

#### [P2] Sign-and-discard: signControlAction result is never verified and the signed message embeds strategyId+timestamp but pause/resume use the same nonce-free scheme  `bug` _(conf:medium)_
- **Where:** src/lib/updown-shared/sign-control.ts:31 (message = `${action}:${strategyId}:${Date.now()}`) consumed by instance/[instanceId]/+page.svelte:84-92
- **What:** The control message uses `Date.now()` as the only freshness factor and the challenge is just the UTF-8 of that message — there is no server-issued nonce. A replay within clock tolerance (or if the engine doesn't strictly bind timestamp) is feasible. More immediately for THIS area: the signed payload is forwarded verbatim and the client treats any `{ok:true}` as success without checking that the engine actually verified the signature, so a permissive/mock engine would let an observer/unauthenticated caller toggle strategies. (Engine-side verification is out of this dir, but the client-side contract here is the trust boundary.)
- **Fix:** Have the engine issue a one-time challenge that signControlAction signs (replace `Date.now()` with a server nonce); on the client, treat missing/!ok results as a hard failure and surface it. Document that signControlAction's output must be server-verified.

#### [P2] winRate unit mismatch + raw unformatted render in hub table  `logic` _(conf:high)_
- **Where:** src/routes/apps/btc-updown-5m/+page.svelte:140 (`{row.stats.winRate}%`) vs everywhere else fmtPct(); and instance detail mixes fraction-based mockStats.winRate (0-1) with pct-based Instance.stats.winRate (e.g. 58.3)
- **What:** `Instance.stats.winRate` is stored as a percentage (mock.ts:39 `winRate: 58.3`). The hub renders it raw as `{row.stats.winRate}%` (→ '58.3%') instead of locale-aware `fmtPct`, so it ignores numberLocale (no thousands/decimal localization, no fixed 1-dp) — inconsistent with the avg-winRate stat card on the same page (line 99 uses fmtPct). Separately, mock-detail.ts `mockStats` returns `winRate` as a FRACTION (line 42 `wins/entered`, 0-1) while Instance.stats.winRate is a percentage; the codebase carries both conventions for the same concept, which is a latent bug when wiring real data (off-by-100).
- **Fix:** Render the hub cell with `fmtPct(row.stats.winRate)` for consistency, and standardize winRate to a single unit (fraction OR percent) across types.ts/mock.ts/mock-detail.ts; convert at the formatter boundary only.

#### [P2] DataTable default-sort init via $effect can be overwritten and never re-syncs when defaults change  `bug` _(conf:medium)_
- **Where:** src/lib/updown-v2/components/DataTable.svelte:44-54, 107-111
- **What:** `sortKey`/`sortDir` are seeded from `defaultSortKey`/`defaultSortDir` inside a one-shot `$effect` guarded by a plain (non-reactive) `let initialized = false`. (1) If a parent passes a different `defaultSortKey` later (e.g. a $derived column set), it is ignored after first run. (2) The separate `$effect` at 107-111 reads `data.length` and resets `currentPage=0` on ANY data-length change — combined with the filter `$effect`, pagination resets unexpectedly when the parent's `$derived` data array merely changes length (e.g. mode filter), which can fight user pagination. Using an `$effect` to initialize state from props is also an anti-pattern vs deriving initial state once.
- **Fix:** Initialize `let sortKey = $state(defaultSortKey)` / `let sortDir = $state(defaultSortDir)` directly (drop the init $effect + `initialized` flag). Keep the page-reset effect but scope it to filterValue/sort changes intentionally, and document that data-length resets the page.

#### [P2] Admin gating is hardcoded to a fake user id — admin codes (secrets) rendered to anyone  `security` _(conf:medium)_
- **Where:** src/routes/apps/btc-updown-5m/space/[spaceId]/+page.svelte:18 (`isAdmin = members.some(m => m.userId === 'user_shelchin' && role==='admin')`); mock.ts:100-114 MOCK_SPACE_SETTINGS.adminCodes
- **What:** Whether the Admin tab + admin codes show is decided purely client-side by matching the literal string `'user_shelchin'`, not the actual logged-in identity. The admin-codes section prints code values like `ADM-001-XXXX` (secrets) into the DOM for whoever satisfies the hardcoded check. In the mock this is fine, but it bakes in a client-trusted-role anti-pattern (LAUNCH_AUDIT: client-supplied/assumed role trusted without verification) that will be copy-pasted when wiring real data, exposing admin codes to non-admins.
- **Fix:** Drive `isAdmin` from the authenticated session/role returned by the engine, not a hardcoded userId, and never render full admin codes client-side without a server authorization check. Mask codes until revealed via an authorized fetch.

#### [P3] Parallel auth system in store is fully dead  `dead-code` _(conf:high)_
- **Where:** src/lib/updown-v2/store.svelte.ts:4-13,22; src/lib/updown-v2/mock.ts:3-8,59-66
- **What:** `auth`, `login()`, `logout()`, `summary`, `MOCK_USER`, `MOCK_SUMMARY` are exported but unreferenced by any consumer (verified by grep across src). They duplicate the role of the real `$lib/auth` authStore the pages actually use, creating confusion about which auth is authoritative.
- **Fix:** Delete `auth`/`login`/`logout`/`summary` from store.svelte.ts and `MOCK_USER`/`MOCK_SUMMARY` from mock.ts (and `StatsSummary`/`User` from types.ts if they become orphaned).

#### [P3] mockHourlyStats called with a composite 'from:to' date string in multi-day mode produces meaningless hours  `bug` _(conf:medium)_
- **Where:** src/routes/apps/btc-updown-5m/space/[spaceId]/instance/[instanceId]/+page.svelte:152-156; src/lib/updown-v2/mock-detail.ts:74-107
- **What:** In multi-day mode the page calls `mockHourlyStats(activeInst.id, detailDateRange.from + ':' + detailDateRange.to)`. Inside mockHourlyStats the `date` param is only used as a hash seed and for `date === now.toLocaleDateString('en-CA')` (which never matches a 'YYYY-MM-DD:YYYY-MM-DD' string), so the 'today truncation' branch is dead and the aggregated hourly chart shows a full 0-23 fabricated curve unrelated to the actual range. It 'works' only because it's mock; it's a misuse of the function's contract that will mislead when real data is wired.
- **Fix:** Add a dedicated `mockHourlyStatsAggregated(strategyId, from, to)` (sum per-hour across the range) instead of overloading the single-date function with a colon-joined string; or pass a proper aggregation flag.

#### [P3] Retired glass-card pattern with hardcoded rgba reintroduced in editor and shared.css  `ui-design` _(conf:high)_
- **Where:** src/routes/apps/btc-updown-5m/editor/+page.svelte:406-412,610; src/lib/updown-v2/styles/shared.css:655-657,678-682,710-713 (.dir-divider/.streak-bar-wrap/.hedge-item)
- **What:** CLAUDE.md/UI-DESIGN-RULES explicitly retire `.glass-card { background: rgba(255,255,255,0.05); border: rgba(255,255,255,0.08) }` because it is invisible/incorrect in light mode and must use tokens. The editor reintroduces it verbatim (and `.btn-secondary` rgba(255,255,255,0.06)). In shared.css the analytics dividers/bars/hedge-items hardcode `rgba(255,255,255,x)` and only patch `[data-theme=light]` for some (dir-divider/streak-bar-wrap/hedge-item) but NOT for the .glass-card the editor uses. Token-correct surfaces should use --bg-elevated/--border-base/--shadow-sm.
- **Fix:** Replace the editor's `.glass-card`/`.btn-secondary` rgba values with `--bg-elevated`+`--border-base`+`--shadow-sm`; in shared.css replace remaining hardcoded `rgba(255,255,255,x)` with tokens (e.g. --border-subtle / --bg-sunken) instead of per-theme overrides.

#### [P3] Zero tests for ~1k LOC including seeded PRNG generators and a generic table  `test-gap` _(conf:high)_
- **Where:** src/lib/updown-v2/* (no *.test.ts; updown-shared has api/formatters/labels tests)
- **What:** mock-detail.ts contains non-trivial deterministic generators (seeded LCG, hashStr, win/loss/skip derivation, pagination math `startId = total - page*pageSize`) and DataTable.svelte contains hand-rolled sort/filter/paginate logic — all untested. The pagination math in mockRounds can produce negative/zero startId at high pages (guarded by `startId - i > 0` but `total` can shift between calls). The sibling updown-shared module DOES have tests, so the bar exists and is unmet here.
- **Fix:** Add unit tests for mock-detail (determinism for same seed, pagination boundaries, winRate fraction invariant) and a component/logic test for DataTable sort+filter+page interactions, mirroring updown-shared's test style.

#### [P3] Add-Space and admin-claim actions are alert()/no-op stubs with collected input discarded  `logic` _(conf:medium)_
- **Where:** src/routes/apps/btc-updown-5m/+layout.svelte:33 (alert TODO + clears addSpaceUrl); space/[spaceId]/+page.svelte:156-158 (claim input has no binding/handler); editor handleSaveDraft:129-131 alert()
- **What:** `addSpaceUrl` is bound and validated nowhere — Connect just `alert('TODO: ...')` then discards. The admin-claim `<input>` has no bind and the Claim button has no onclick, so the field is purely decorative. handleSaveDraft alerts. These are acceptable in a prototype but should be visibly marked as non-functional (disabled/badged) so users/reviewers don't assume they work, and so the bound `addSpaceUrl` store state (store.svelte.ts:63) isn't mistaken for live wiring.
- **Fix:** Either disable these controls with a 'coming soon' affordance, or remove the bound state/inputs until wired. Don't ship interactive-looking inputs that silently drop data.

### Dead code
- store.svelte.ts:5-13 — `auth` $state + `login()` + `logout()`: a complete parallel auth state. NO route imports `auth`/`login`/`logout` (verified by grep across src); every page uses the real `authStore` from `$lib/auth` instead. The store's auth is unreachable dead code.
- store.svelte.ts:22 — `summary` $state and mock.ts:59-66 `MOCK_SUMMARY`: never imported anywhere outside updown-v2 (the hub computes its own `modeTodayProfit`/`modeWinRate` from instances). `MOCK_SUMMARY` and `StatsSummary` (types.ts:58-66) are only referenced to seed this unused `summary`.
- mock.ts:3-8 — `MOCK_USER` is only consumed by the dead `login()` in the store; with `login` dead, `MOCK_USER` is dead too.
- types.ts:1-17 — `Strategy` interface is imported only by editor/+page.svelte to type a `$derived` object that is shown as JSON preview and whose `.id`/`.name` are passed to `createInstance`; the full BIP-323 shape (signal/filter/risk/exit) is never consumed — acceptable for a prototype but flag as speculative surface.
- formatter-bridge.ts:13 — `createFormatterCtx(exchangeRate = 1)` param: every caller (instance + member detail) invokes `createFormatterCtx()` with no arg, so the exchangeRate path is never exercised (always 1).
- utils.ts:42-51 — `shortDate()` and `shortDateHour()` are exported but never imported by any route (grep shows only `fmt/fmtShort/fmtPct/fmtDate/profitClass/statusDot` are used). Dead helpers.

### Duplication
- utils.ts (fmt/fmtShort/fmtPct/fmtDate) vs updown-shared/formatters.ts (fmtProfit/fmtPct/fmtLocalDate): overlapping money/percent/date formatting with the SAME `sign = v>=0 ? '+'` convention (utils.ts:21,28 vs formatters.ts:80). v2 made its own i18n-bound copies instead of reusing the shared `FormatterContext` ones it already bridges in formatter-bridge.ts. Pick one: either route v2 pages through `ctx`+shared formatters (already imported for charts) or document why a parallel set exists.
- DataTable.svelte (generic sort/filter/paginate table, 370 lines) vs the hand-rolled marketplace table CSS+logic in styles/shared.css:484-604 (.mkt-* classes) and the sidebar sort in instance/[instanceId]/+page.svelte:37-54 (toggleSidebarSort / sortedSpaceInstances). Three separate sort/toggle implementations of the same asc/desc-toggle pattern. The sidebar sort could reuse DataTable or a shared `toggleSort` helper.
- Empty-state markup is triplicated: hub uses `.onboarding-card` (+page.svelte:106-110), space page uses `.empty-state` (space/[spaceId]/+page.svelte:54-60), DataTable uses `.dt-empty` (DataTable.svelte:128-131) — three different empty-state components with near-identical copy keys.
- styles/shared.css duplicates the `.prompt-card` block twice (lines 37-39 and 76-80) with conflicting padding/border values; the second definition silently wins. Dead/contradictory CSS.


## subscription + membership

- **Tests:** none · **Files reviewed:** 10
- This area implements a Pro fee waiver (wallet-sweep / token-sender service fee → 0) gated by a client-side passkey "control proof": a live WebAuthn P-256 assertion is verified with crypto.subtle against the logged-in user's stored public key, then `memberWaiver.isWaiverActive` flips the fee to 0. The signature verification itself is well-constructed (allowCredentials binding, rawId recheck, clientData type+challenge replay check, full ECDSA verify). However the gate has a critical design flaw: the "is this account premium?" check and the "do you control the passkey?" check are decoupled and read from two different identities. The premium flag lives in a global `subscriptionStore` that PageHeader loads for whatever external wallet is connected, so a non-premium passkey user (or anyone with a custom EIP-1193 provider) can poison `isPremium=true` and then satisfy the proof with their own legitimate passkey — waiving the fee with no subscription. Membership state is also never reset on logout/disconnect, and there are no tests at all.

### Findings

#### [P1] ensureMembershipLoaded loaded-guard returns stale premium for the wrong address (false negatives too)  `logic` _(conf:high)_
- **Where:** src/lib/subscription/member-proof.svelte.ts:86-91
- **What:** ensureMembershipLoaded returns early if `subscriptionStore.loaded || subscriptionStore.loading`, but the store may have been loaded for a DIFFERENT address (PageHeader loads it for the active external wallet). Beyond the P0 bypass, this also breaks legitimate users: a real Pro passkey user who also has a non-premium external wallet connected will see subscriptionStore.isPremium=false (loaded for the external addr), proveMemberControl skips the reload and returns reason:'not-member' (:107) even though their own Safe IS premium. The store's load() also silently swallows all errors (subscription-store.svelte.ts:51) and still sets loaded=true, so a transient RPC failure permanently latches isPremium=false until reset.
- **Fix:** Track which address the store loaded for, gate reload on mismatch, and stop latching on error.

1) subscription-store.svelte.ts — add a loadedFor field and only mark loaded on success:
   loadedFor = $state<string | null>(null);
   async load(safeAddress) {
     if (!browser) return;
     this.loading = true;
     try {
       const [info, tokenId] = await Promise.all([getSubscriptionInfo(safeAddress), getActiveTokenId(safeAddress)]);
       this.isPremium = info.isPremium; this.expiryTime = info.expiryTime;
       this.remainingTime = info.remainingTime; this.activeTokenId = tokenId;
       this.loadedFor = safeAddress.toLowerCase();
       this.loaded = true;             // only on success
     } catch {
       this.loaded = false;            // do NOT latch — next call retries
       // optionally clear loadedFor so a stale address is not trusted
     } finally {
       this.loading = false;
     }
   }
   reset() { ... this.loadedFor = null; }

2) member-proof.svelte.ts ensureMembershipLoaded — reload when the loaded address differs from the logged-in Safe:
   const addr = (user.safeAddress as string).toLowerCase();
   if (subscriptionStore.loading) return;
   if (subscriptionStore.loaded && subscriptionStore.loadedFor === addr) return;
   await subscriptionStore.load(user.safeAddress as Address);

This fixes (1) and (2) (premium is always evaluated against the logged-in Safe, never a co-connected external wallet) and (3) (transient errors no longer permanently latch isPremium=false). Note: isWaiverActive/canProve read subscriptionStore.isPremium which can still reflect the external wallet for non-proof UI; if that matters, those getters should likewise key on loadedFor===user.safeAddress, but the security-relevant gate is the proof path fixed above.

#### [P2 (was P0)] Fee-waiver bypass: premium check and passkey proof are bound to different identities (cross-wallet poisoning)  `security` _(conf:high)_
- **Where:** src/lib/subscription/member-proof.svelte.ts:60-68 (isWaiverActive) + :97-107 (proveMemberControl) + src/lib/widgets/PageHeader.svelte:42-46
- **What:** `subscriptionStore` is a GLOBAL singleton. PageHeader's $effect loads it for `walletStore.activeWallet.address`, and activeWallet returns ANY connected external wallet (inject/walletpair) over the passkey user (wallet-store.svelte.ts:55-59). The membership gate (isWaiverActive) only checks `subscriptionStore.isPremium` (the global, now reflecting the external address) AND `provenSafe === user.safeAddress`. The passkey proof in proveMemberControl verifies a signature against the user's OWN publicKey and only reads `subscriptionStore.isPremium` — it never re-loads or verifies premium status for `user.safeAddress` (ensureMembershipLoaded at :86-91 even SKIPS loading when `subscriptionStore.loaded` is already true from the external load). Attack: a logged-in non-premium passkey user connects any premium smart-contract wallet — or supplies a custom EIP-1193 provider (a trivial window.ethereum shim) that reports a known premium Safe address and returns non-empty eth_getCode to pass the classifyAccount gate (gate.ts:40-52). subscriptionStore.isPremium becomes true for that address. The user then clicks 'Waive fee', proves control of their OWN passkey (fully legitimate), and isWaiverActive→true. quoteSweepFee/quoteFee return amount=0 (fee.ts:63 / fee.ts:19). Result: full service-fee waiver with no subscription on the user's own Safe. The passkey 'control proof' provides no protection because it authenticates a different account than the one whose premium status was checked.
- **Fix:** Root cause: the premium status used by the waiver gate is read for the *active wallet* (external-first) via a global, address-unkeyed singleton, while the passkey proof and the final gate compare against the *passkey user's* Safe. The two identities are decoupled.

Minimal fix (capture-at-proof, don't trust the global):
1. In proveMemberControl, after the passkey assertion succeeds, do a FRESH on-chain read for the user's own Safe bypassing the loaded-guard: `const info = await getSubscriptionInfo(user.safeAddress as Address);` then `if (!info.isPremium) return { ok:false, reason:'not-member' };`. Set `memberWaiver.provenPremium = true` alongside `provenSafe = user.safeAddress`. Do NOT gate on the global `subscriptionStore.isPremium`.
2. Add `provenPremium = $state(false)` to MemberWaiver; in isWaiverActive replace `subscriptionStore.isPremium` with `this.provenPremium` (and keep `provenSafe === user.safeAddress`). Reset it in reset().
3. Defense-in-depth: key subscriptionStore by address — store the queried address and treat isPremium as stale (reset/reload) when the queried address differs from the address being asked about, so an external-wallet load is never read as the passkey user's status. (UI display of an external wallet's premium badge should not feed the waiver decision at all.)

This makes the waiver depend solely on a fresh on-chain premium check for the same Safe that the passkey proves control of, closing the cross-wallet poisoning. (Note: full enforcement still requires moving fee=0 logic server/on-chain; that is a separate product decision already acknowledged as client-only.)

#### [P2 (was P1)] Waiver is never reset; survives logout and silently reactivates on re-login without a fresh passkey assertion  `security` _(conf:high)_
- **Where:** src/lib/subscription/member-proof.svelte.ts:46-83 (reset never called) + src/lib/auth/auth-store.svelte.ts:76-80 (logout) + src/lib/wallet/wallet-store.svelte.ts:154-163 (disconnect)
- **What:** memberWaiver.reset() exists but is never invoked (grep across src = 0 call sites). The doc comment promises a per-session (本会话) proof, but `active`/`provenSafe` persist across logout. While the user is logged out, isWaiverActive returns false because user is null — but logout creates no new identity and login rebuilds the SAME AuthUser (safeAddress is deterministic from publicKey, passkey-auth.ts:46-57). So after logout→login of the same account, `active` is still true and `provenSafe.toLowerCase() === user.safeAddress.toLowerCase()` again, so isWaiverActive flips back to true with NO new biometric assertion. This defeats the stated 'prove control right now' guarantee (e.g. a shared/kiosk browser: user A proves, logs out; later user A's session is reused without re-auth). It also leaves stale waiver state across account switches if publicKeys ever collide via spoofed login data.
- **Fix:** Root cause: memberWaiver holds no link to the live identity and is never invalidated when that identity changes; isWaiverActive's freshness guarantee relies solely on a never-reset boolean plus a deterministic-address equality check.

Minimal fix (any one of these closes the same-account reactivation):
1) Call memberWaiver.reset() from authStore.logout() (auth-store.svelte.ts:76-80). Also reset on identity reassignment: in authStore.setUser() and on the login() success path (auth-store.svelte.ts:51-54, 63-66), and in walletStore.setExternal()/disconnect() so switching wallets clears any prior proof. logout already delegates here for biubiu.
2) Add a provenAt max-age gate in isWaiverActive, e.g. Date.now() - this.provenAt <= PROOF_TTL_MS (e.g. 5-10 min), so the proof is genuinely time-bounded even if reset is missed.

Best: do both — reset on every identity transition AND enforce a TTL via provenAt. To avoid coupling member-proof to auth internals, the cleanest place is an $effect that watches authStore.user identity and calls memberWaiver.reset() whenever it changes (covers logout, login, setUser, and account switch in one spot), combined with the provenAt TTL check inside isWaiverActive.

#### [P2] Zero tests across the entire membership/fee-waiver security boundary  `test-gap` _(conf:high)_
- **Where:** src/lib/subscription/* (no *.test.ts / *.spec.ts present)
- **What:** The fee-waiver is the monetization gate and the explicit focus is 'can a watch-only wallet bypass it'. There are no tests for proveMemberControl (challenge replay, wrong-credential, bad-signature), for isWaiverActive's address binding, or for the cross-wallet poisoning path. The signature-verification logic (derToRawSignature, clientData challenge equality, ECDSA verify) is exactly the kind of crypto plumbing that silently breaks. fee.ts has a spec (token-sender/core/fee.spec.ts) but it only tests amount math, not the membership decision.
- **Fix:** Add unit tests: (1) isWaiverActive false when subscriptionStore.isPremium is true but was loaded for a different address than user.safeAddress; (2) proveMemberControl rejects a tampered challenge / mismatched rawId / bad signature; (3) waiver clears on logout and does NOT auto-reactivate on re-login without a new proof; (4) a premium status loaded for an external wallet cannot satisfy the gate for the passkey user. Mock navigator.credentials and crypto.subtle.

#### [P3] loadFallbackPrices trusts unvalidated external JSON shape  `bug` _(conf:medium)_
- **Where:** src/lib/subscription/SubscriptionModal.svelte:117-135
- **What:** `const data = await res.json(); const ethPriceUsd = data.ethereum.usd as number;` — no check on res.ok or shape. If CoinGecko returns an error body or rate-limit object, `data.ethereum` is undefined and `.usd` throws; it's caught and shown as priceError, so impact is limited to the display-only fallback path (contract not deployed). Still, BigInt(Math.round(undefined*1e8)) could throw RangeError on NaN before the catch in some shapes.
- **Fix:** Guard: `if (!res.ok) throw…; const usd = data?.ethereum?.usd; if (typeof usd !== 'number' || !(usd>0)) { error = t('sub.priceError'); return; }` before computing wei.

#### [P3] SubscriptionBadge / tier-badge use hardcoded hex gradient and rgba shadows (not theme tokens)  `ui-design` _(conf:low)_
- **Where:** src/lib/subscription/SubscriptionBadge.svelte:33-37 + src/lib/subscription/SubscriptionModal.svelte:536-539
- **What:** `background: linear-gradient(160deg, #c9a227, #a8851a)`, `color:#fff`, `text-shadow: 0 1px 2px rgba(0,0,0,0.2)` are hardcoded rather than tokens. This is a deliberate brand-gold badge so it renders the same in both themes (acceptable as an exception), but the rgba shadow + #fff text are the pattern UI-DESIGN-RULES warns against and won't adapt to light mode contrast.
- **Fix:** If keeping brand gold, define it as a token (e.g. --premium-gold / --premium-gold-fg) and reference it in both spots so the two badges can't diverge; or at minimum replace the rgba shadow with --shadow-sm.

### Dead code
- memberWaiver.provenAt — set at member-proof.svelte.ts:174 and reset at :78, but never read anywhere (grep finds no reader). Intended as a session-age field but no expiry logic uses it. Either implement a max-age check in isWaiverActive or remove the field.
- memberWaiver.reset() — defined at member-proof.svelte.ts:75-80 but never called from any file (grep across src finds zero call sites). The waiver is consequently never explicitly cleared on logout or wallet disconnect.
- SubscriptionModal.svelte buildRenewCallData / 'renew' transfer interplay: handleSubscribe computes isRenew from mode==='renew' && activeTokenId>0n, but ProfileModal/PageHeader expose subscribe and transfer flows; renew mode is reachable only via openSubscription('renew') — confirm a caller actually passes 'renew' (only 'subscribe'/'transfer' paths were observed in PageHeader), otherwise the renew branch is unreachable.

### Duplication
- quoteFee (token-sender/core/fee.ts) and quoteSweepFee (wallet-sweep/infra/fee.ts) are near-identical: same member-free → fixed → $5-equiv → 1-native priority and same parseUnits math; only the native-USD price source differs (price.ts vs inline Chainlink). The member-free short-circuit (`if (isMember) return { amount: 0n, source: 'member-free' }`) is duplicated. Extract a shared `resolveFee(opts, fetchPrice)` so the two can never diverge — the wallet-sweep file even comments that they must stay in sync, which is a maintenance smell.
- Membership 'derived' getters are copy-pasted across both app stores: token-sender/store.svelte.ts:118-138 (isMember/canWaiveFee/waiveProving/loadMembership/waiveFeeWithPasskey) and wallet-sweep/store.svelte.ts:141-159 (feeWaived/canWaiveFee/waiveProving/loadMembership/waiveFeeWithPasskey) are the same thin pass-throughs to memberWaiver. Consider a shared mixin/helper object to avoid drift.


## auth (safe-tx)

- **Tests:** sparse · **Files reviewed:** 11
- This area implements passkey (P-256) Safe-1.4.1 + ERC-4337 transaction signing (build-userop.ts, send-token.ts, send-contract-call.ts, webauthn-sign.ts) and Safe ERC-1271 off-chain message/typed-data signing + a local WebAuthn verifier (sign-message.ts). The cryptographic core is generally sound: SafeOp vs SafeMessage EIP-712 domains are correctly separated (different typehash + different verifyingContract), chainId is bound into both digests, and the signer correctly low-S-normalizes for the RIP-7212 precompile. The main gaps are (1) the "authoritative" local verifier is weaker than on-chain semantics (accepts malleable high-S and does not validate the type/clientDataFields structure it reconstructs), (2) extractClientDataFields makes brittle byte-offset assumptions that silently break for non-canonical field ordering, and (3) the entire transaction-authorizing path (calculateSafeOpHash, DER parsing, contract-signature layout, low-S normalization) has zero unit tests — only the message-hash/verifier has a spec.

### Findings

#### [P2] Local ERC-1271 verifier accepts malleable (high-S) signatures, diverging from on-chain RIP-7212 semantics  `security` _(conf:high)_
- **Where:** src/lib/auth/safe-tx/sign-message.ts:144-197 (verifyWebAuthnContractSig), reached via verifySafeMessageSignature/verifySafeTypedDataSignature and wallet/backends/biubiu.ts:180-208
- **What:** verifyWebAuthnContractSig feeds (r,s) straight into crypto.subtle.verify, which accepts BOTH a signature and its malleated counterpart (r, n-s). PoC confirmed: for one message both the low-S sig and the high-S sig (P256_N-s) verify true. The file's own docstring calls this 'the authoritative check for biubiu' because on-chain isValidSignature is unavailable (fallback handler = 4337 module). But the real on-chain SafeWebAuthnSharedSigner uses verifiers=0x100 (RIP-7212), which rejects high-S. So a high-S signature can pass this local 'authoritative' verifier yet be rejected by the precompile the account actually relies on — a verifier/chain mismatch. Impact: any relying party treating verifyMessage=true as proof the account 'would accept' this signature can be fooled by a malleated blob; and two distinct valid signatures exist per message (breaks any dedup/anti-replay keyed on signature bytes).
- **Fix:** In verifyWebAuthnContractSig, after decoding s, reject high-S before verifying: import P256_N from crypto-utils and add `if (s > P256_N / 2n) return false;`. Matches the signer (webauthn-sign.ts:116) and the RIP-7212 low-S requirement, making the local verifier agree with on-chain.

#### [P2] extractClientDataFields breaks silently for non-canonical WebAuthn field ordering/whitespace  `logic` _(conf:medium)_
- **Where:** src/lib/auth/safe-tx/webauthn-sign.ts:26-49
- **What:** After locating the challenge value's closing quote, the code does json.slice(valueEnd + 2, json.length - 1), hard-assuming the next two chars are exactly `",` and that challenge is never the last field. PoC: if an authenticator emits challenge as the LAST field it returns '' (empty); if it inserts JSON whitespace after the challenge value (`"challenge":"abc" ,`) it returns a malformed leading-comma/space string. Either case yields a clientDataFields that, when the on-chain Safe verifier reconstructs `{...,"challenge":"<c>",<clientDataFields>}`, no longer reproduces the bytes the authenticator signed, so the ERC-1271 / 4337 signature check FAILS — the user's tx/message becomes silently un-verifiable. Browser clientDataJSON is canonically ordered today so this rarely triggers, but it is an unguarded, untested correctness landmine on the funds path.
- **Fix:** Parse defensively: slice from the char after the challenge value's closing quote to the final '}', then strip a single leading ',' if present rather than blindly skipping 2 chars (e.g. start at valueEnd+1 then `.replace(/^\s*,/, '')`), and assert the result starts with '"' / is non-empty.

#### [P2 (was P1)] Transaction-authorizing signing path has zero unit tests  `test-gap` _(conf:high)_
- **Where:** src/lib/auth/safe-tx/build-userop.ts (calculateSafeOpHash, buildContractSignatureWebAuthn, buildInitCode, buildDummySignature), webauthn-sign.ts (low-S, extractClientDataFields), crypto-utils.ts (derToRawSignature), compute-safe-address.ts (computeSafeAddress)
- **What:** The only spec in the area (sign-message.spec.ts) covers the SafeMessage hash and the local verifier. The bytes that actually move funds — calculateSafeOpHash (the EIP-712 digest the passkey signs to authorize a UserOp), the 65-byte contract-signature layout, the low-S normalization (webauthn-sign.ts:116), DER->raw conversion (derToRawSignature with 33-byte leading-zero trimming), extractClientDataFields, and computeSafeAddress (deterministic Safe address) — have no tests. A single off-by-one in the SafeOp ABI tuple, the hardcoded 65n signature offset, or the salt computation would silently produce wrong-address deposits or unspendable accounts with nothing in CI catching it. sign-message.spec only proves the verifier is self-consistent with its own forge helper; it does not pin calculateSafeOpHash or the contract-sig layout against a known-good vector.
- **Fix:** Add src/lib/auth/safe-tx/build-userop.spec.ts (and a sibling for compute-safe-address / crypto-utils), mirroring how sign-message.spec.ts pins calculateSafeMessageHash. Minimal, high-value assertions:

(a) Pin calculateSafeOpHash against an independent viem reference. Build the SafeOp via viem hashTypedData with domain { chainId, verifyingContract: CONTRACTS.safe4337Module } and the SafeOp type matching SAFE_OP_TYPEHASH's field list (safe, nonce, initCode, callData, verificationGasLimit, callGasLimit, preVerificationGas, maxPriorityFeePerGas, maxFeePerGas, paymasterAndData, validAfter, validUntil, entryPoint). Note: viem will hash bytes/initCode/callData/paymasterAndData itself, so pass the raw bytes to hashTypedData (not pre-hashed) — this is the whole point, an independent encoder catching a tuple/order/typehash drift. Assert equality with calculateSafeOpHash for at least: deployed case (initCode='0x') and undeployed case (real initCode), plus a chain-specificity assert (chainId 1 vs 8453 differ).

(b) Pin buildContractSignatureWebAuthn raw layout: assert sig.slice(0,66) decodes r = pad(CONTRACTS.safeWebAuthnSharedSigner,32); bytes 32..64 == pad(65n) (0x...0041); byte 64 == 0x00; bytes 65..97 == abi-encoded length of the dynamic blob. Then assert it round-trips: decodeAbiParameters([bytes,string,uint256,uint256], '0x'+sig.slice(196)) returns the original (authData, clientDataFields, r, s). This pins the byte offsets, not just self-consistency.

(c) derToRawSignature: feed a known high-S DER vector (and one with a 33-byte 0x00-prefixed r) and assert the 64-byte r||s output matches a hand-computed expected; assert it throws on a malformed (non-0x02) DER. Separately assert the low-S normalization in webauthn-sign indirectly by unit-testing the rule s > P256_N/2 => P256_N - s on a fixed high-S value.

(d) computeSafeAddress: pin one known publicKey -> address vector (compute once from the current correct code, hardcode it) so any change to PROXY_CREATION_CODE, encodeSetupData, calculateSaltNonce, or the CONTRACTS addresses is caught. Also assert two distinct public keys yield distinct addresses (calculateSaltNonce sanity).

These are pure functions with no chain/WebAuthn dependency, so they run under the existing `vitest` (test:unit) with no new infra.

#### [P3] Local verifier hardcodes type "webauthn.get" and ignores actual signed type, reducing it to a self-consistency check  `security` _(conf:medium)_
- **Where:** src/lib/auth/safe-tx/sign-message.ts:164-168
- **What:** verifyWebAuthnContractSig reconstructs clientDataJSON with a fixed `"type":"webauthn.get"` literal and never validates the type the authenticator actually used; clientDataFields is taken verbatim from the (potentially attacker-supplied) signature blob. Because the account public key is still required this is not a third-party forgery vector, but it means the function only proves 'someone with the private key signed SOME clientData containing this challenge' — it cannot distinguish a webauthn.get assertion from another context and would validate clientDataFields containing extra/duplicate JSON keys. Low impact today (verifyMessage is used by the wallet-debug page and as an optional chat identity hint, not for session gating), but it weakens the guarantee the docstring advertises ('authoritative check').
- **Fix:** Reject clientDataFields containing a nested '"challenge"' or '"type"' token before reconstruction, and document the trust boundary (verifier proves key possession over this challenge, not the WebAuthn ceremony type).

### Duplication
- The bundler receipt-polling loop is duplicated verbatim between send-token.ts:184-202 and send-contract-call.ts:290-314 (waitReceipt) — same 120s window, 1500ms interval, 'Transaction reverted'/'confirmation timed out' strings. send-token.ts should import/reuse waitReceipt from send-contract-call.ts (or both move it to a shared helper).
- The sign-and-pack step is duplicated: send-token.ts:156-164 inlines signSafeOpWithPasskey + buildContractSignatureWebAuthn + buildUserOpSignature, identical to the signOp helper in send-contract-call.ts:278-288. send-token.ts should call the same signOp helper.
- The base64url-no-pad encoder in sign-message.ts:126-129 (base64urlNoPad) duplicates crypto-utils.ts:6-11 toBase64url; consolidate into crypto-utils.


## deploy + vela-chain-setup + evm + chains

- **Tests:** none · **Files reviewed:** 22
- Contract-deployer infra (CREATE2 prediction, network-readiness checks) and the vela chain-setup wizard (pre-signed Nick's-method txs + CREATE2 deploys of the Safe/4337 stack) plus the evm helpers and chains data layer. I independently verified the cryptographic core with viem: all 8 CREATE2 addresses in deployment-data.json match the hardcoded contract addresses, the Arachnid and Multicall3 pre-signed-tx deployer EOAs recover correctly, the funding amounts (0.01 / 0.1 ETH) match gasPrice*gasLimit, and the P256 test vector is sha256("test"). Core deploy math is sound and the Safe addresses are consistent across modules. Overall health: good on correctness of the deterministic-deployment constants, but there is one real UI/store logic divergence in deployAllMissing, an insufficient salt-validation bug, a stale-result race on chain switching, substantial RPC-helper duplication, and several dead exports. Test coverage is effectively zero for this entire area.

### Findings

#### [P2 (was P1)] deployAllMissing ignores the UI's scoped contract set and deploys ALL non-external missing contracts  `logic` _(conf:high)_
- **Where:** src/lib/vela-chain-setup/store.svelte.ts:579-617 (deployAllMissing) vs routes/apps/vela-wallet-chain-setup/+page.svelte:636-778
- **What:** The UI computes deployableContracts = isEntryPoint ? [next] : missingSafe (safe-factory only), shows that list + a 'Deploy all (N)' button, and renders a live progress list over only those contracts. But the button calls store.deployAllMissing(), which ignores that scope and iterates this.missingContracts.filter(deployMethod !== 'external') — i.e. EVERY missing contract incl. arachnidProxy (nicks-method) and multicall3 (presigned-tx). Two concrete failures: (1) When EntryPoint is the shown action, deployAllMissing also silently deploys safe4337Module/safeModuleSetup and the safe-factory contracts the user never saw; the live list only shows EntryPoint, so activeContractKey can point at a contract not in the rendered list (blank progress). (2) If multicall3 or arachnidProxy is still missing at this step, getDeployCalldata() throws 'Deployment data ... is not configured' (deployment-data.json only has the 8 CREATE2 contracts), which is caught, sets deployError and aborts the whole batch — the user clicked 'Deploy EntryPoint' and got a confusing multicall3 error.
- **Fix:** Make deployAllMissing operate on the same scoped set the UI renders. Minimal fix: pass the explicit keys from the page.

store.svelte.ts:579 — change signature to accept the scoped keys and iterate them:
  async deployAllMissing(keys?: string[]) {
    if (!this.deployerWallet || !this.selectedChain) return;
    const deployable = (
      keys && keys.length
        ? keys.map(k => this.contractStatuses.find(s => s.key === k)).filter((s): s is ContractStatus => !!s && !s.deployed)
        : this.missingContracts.filter(c => c.def.deployMethod !== 'external')
    );
    if (deployable.length === 0) return;
    // …unchanged loop, but use `deployable.length` for the count and break-on-error as before
  }

+page.svelte:766 and :773 — pass the rendered scope:
  onclick={() => store.deployAllMissing(deployableContracts.map(c => c.key))}

This guarantees the live progress list (which iterates deployableContracts) and the "Deploy all (N)" count exactly match what deployAllMissing actually deploys, and activeContractKey always corresponds to a rendered row.

Note: doing this means safe4337Module/safeModuleSetup (arachnid-proxy method) will NOT be included when isEntryPoint=false, because missingSafe filters to deployMethod==='safe-factory'. Those two ARE in deployment-data.json and getDeployCalldata supports them, so the better fix is to broaden the UI scope to "everything the deployer wallet can deploy at this step" rather than just safe-factory: change +page.svelte:637-639 to
  const missingDeployerStep = store.missingContracts.filter(c => c.def.deployMethod === 'safe-factory' || c.def.deployMethod === 'arachnid-proxy');
and use isEntryPoint ? [next] : missingDeployerStep for deployableContracts. Then pass deployableContracts.map(c=>c.key) to deployAllMissing. This keeps UI and store perfectly in sync and stops silently deploying arachnid-proxy modules that the list never shows. getDeployCalldata supports both arachnid-proxy and safe-factory methods (it picks ARACHNID_PROXY vs SAFE_FACTORY by deployData.factory), so no throw risk.

#### [P2 (was P1)] Salt with valid length but invalid hex passes validation → wrong predicted address + corrupt calldata  `bug` _(conf:high)_
- **Where:** src/lib/deploy/create2.ts:70-82 (predictCreate2Address) and deploy-store.svelte.ts:239,597,678
- **What:** Salt comes from a free-text input (DeployerDeployCard.svelte:59) and is only ever validated by length: predictCreate2Address checks salt.length !== 66 and canDeploy checks this.salt.length === 66. viem's keccak256/concat do NOT throw on invalid-hex strings — I verified keccak256('0xZZ...') returns a hash and concat() silently passes the bad bytes through. So a salt like 0xZZ00...00 (length 66) yields a confident-but-wrong predicted address shown to the user, and in deploy() the calldata becomes ('0xZZ..00' + initCode.slice(2)) = a malformed hex string sent to wallet.sendCalls. Best case the tx fails on-chain (wasted gas / confusing failure); worst case the user funds/relies on a predicted address that does not correspond to the actual deployment.
- **Fix:** Add a strict 32-byte-hex check and reuse it at all three gates plus surface an inline error.

1) create2.ts — replace the length-only guard in predictCreate2Address:
   const SALT_RE = /^0x[0-9a-fA-F]{64}$/;
   export function isValidSalt(s: string): s is Hex { return SALT_RE.test(s); }
   // in predictCreate2Address:
   if (!isValidSalt(salt)) return null;   // instead of `if (salt.length !== 66) return null;`

2) deploy-store.svelte.ts:
   - line 597 updatePredictedAddress: `if (!contract || !isValidSalt(this.salt))` → predictedAddress = null. (Already null-safe; this just stops showing a bogus address.)
   - line 239 canDeploy: replace `this.salt.length === 66` with `isValidSalt(this.salt)`.
   - line 678 deploy(): predictCreate2Address already returns null for a bad salt → the existing guard at 672-675 ('Cannot compute predicted address') now actually trips before building calldata, so the malformed calldata is never constructed. (Optionally also early-return with a clear 'Invalid salt' log.)
   - Add a deployBlocker reason (e.g. 'salt') so the disabled Deploy button explains itself.

3) DeployerDeployCard.svelte:59: show an inline error under the salt input when !isValidSalt(store.salt) (e.g. a derived `saltError` flag), e.g. add aria-invalid and a small error <p> using deploy.help/error.salt i18n key, so the user sees WHY it's blocked instead of a silently-wrong predicted address.

This is minimal (one regex, reused at 3 sites) and turns the silent-wrong-address behavior into an explicit, surfaced validation error.

#### [P2] Rapid chain switch in deploy-store can apply a stale network-check / gas result to the new chain  `logic` _(conf:medium)_
- **Where:** src/lib/deploy/deploy-store.svelte.ts:383-419 (selectChain) → runNetworkCheck()/fetchGasPrices() fired un-awaited; also runNetworkCheck:471-508
- **What:** selectChain sets selectedChain then fires runNetworkCheck() and fetchGasPrices() without awaiting and without a request-id guard. checkNetworkSupport for chain A can resolve AFTER the user has selected chain B (whose own selectChain reset networkCheck=null), writing A's ready/gasBalance result while selectedChain is B. Result: the readiness badge / Deploy gate can reflect the wrong chain. switchRpc/applyCustomRpc have the same un-guarded overlap (two runNetworkCheck in flight). The vela store mitigates by awaiting runCheck; this store does not.
- **Fix:** Add a monotonically increasing token captured at the start of selectChain/runNetworkCheck and ignore the result if the token changed (if (token !== this._checkToken) return) before assigning networkCheck/gas fields; or store an AbortController per chain selection and abort the previous.

#### [P2] Network-check contract cache can be poisoned by a lying custom RPC, then trusted for the real RPC  `security` _(conf:medium)_
- **Where:** src/lib/deploy/network-check.ts:165-169,208-263 (cacheContracts / 7-day cache keyed only by chainId)
- **What:** Contract presence (CREATE2 proxy, 8 Safe contracts, P256) is cached in localStorage keyed solely by chainId for 7 days, and is written whenever allContractsOk. applyCustomRpc only verifies the RPC's eth_chainId matches; it does not constrain eth_getCode/eth_call honesty. A malicious custom RPC for chainId X that returns non-empty code for every address and 1 for the P256 call makes allContractsOk true → cache[X] = ready. The cache is then reused even after the user switches to a legitimate RPC (forceRefresh is never passed and clearCachedCheck is never called), so the readiness gate shows 'ready' on a chain that actually lacks the infra. Deploy via wallet.sendCalls would then fail/behave unexpectedly. Requires the user to deliberately enter an attacker RPC, so impact is limited.
- **Fix:** Do not cache results obtained via a user-supplied custom RPC (skip cacheContracts when usingCustomRpc), or key the cache by (chainId, rpcOrigin), or only cache the 'present' result when fetched from a discovered (registry) RPC. Also wire forceRefresh / clearCachedCheck into a manual 'recheck' control.

#### [P2] Throwaway deployer private key stored in plaintext localStorage and never cleared  `security` _(conf:medium)_
- **Where:** src/lib/vela-chain-setup/deployer-wallet.ts:41-50,155-163 (saveWallet under key 'vela-chain-setup-deployer'); goBack() store.svelte.ts:661-677 does not clear it
- **What:** getOrCreateDeployerWallet generates a private key and persists {privateKey,address} in localStorage in cleartext. This is a documented 'temporary, downloadable' deployer EOA, but: (a) the key persists indefinitely — goBack()/resetDeployState only null the in-memory copy, and clearStoredWallet() is dead code (never called), so any leftover dust the user sent remains drainable by anyone with access to the browser profile / an XSS on the origin; (b) the key is readable by any script on the origin. For a wallet/DeFi tool this is a real (if user-acknowledged) key-at-rest exposure.
- **Fix:** Offer/auto-trigger clearStoredWallet(chainId) once deployment completes or on goBack, and prompt the user to sweep residual funds. At minimum surface a 'remove deployer key' action and call the existing clearStoredWallet. Consider memory-only keys with explicit opt-in persistence given the rest of the app uses session-ephemeral keys (e.g. e2e-chat/walletpair).

#### [P3] Predicted-address 'already deployed' check is racy with the Deploy click; redeploy reverts and wastes gas  `bug` _(conf:medium)_
- **Where:** src/lib/widgets/DeployerDeployCard.svelte:20-27 (500ms debounce) + deploy-store.svelte.ts:231-242 (canDeploy), 650-659 (deploy)
- **What:** checkAddressDeployed runs 500ms after predictedAddress/effectiveRpc change and sets addressAlreadyDeployed. canDeploy and deploy() both gate on the (possibly stale) addressAlreadyDeployed flag. Within the debounce window addressAlreadyDeployed is still false (reset on chain/contract change), so a fast user can submit a CREATE2 deploy to an address that already has code; the Arachnid proxy call then reverts on-chain, wasting gas and showing a generic failure. checkAddressDeployed also has no guard that predictedAddress hasn't changed by the time the fetch returns.
- **Fix:** In deploy(), await a fresh on-chain code check immediately before sending (not just the debounced flag), and bail if code exists. Optionally disable the Deploy button while checkingAddress is true.

#### [P3] Constructor arg parsing fails for nested arrays/tuples and does not trim address/string inputs  `bug` _(conf:medium)_
- **Where:** src/lib/deploy/create2.ts:46-64 (parseArgValue)
- **What:** parseArgValue handles only one array level: for T[] it JSON-parses then maps String(v) over elements, so a nested type like uint256[][] turns inner arrays into '1,2' and BigInt() throws → buildInitCode returns null → no predicted address and deploy is blocked with no explanation. tuple/struct args also fail (viem needs components). Addresses/strings are passed raw, so a pasted ' 0xabc... ' with whitespace fails encoding. Not a security issue (fails closed to null), but it silently blocks deploying contracts with such constructors.
- **Fix:** For array types, JSON.parse once and recurse on parsed (not String-coerced) values; for tuple types pass through the JSON-parsed object and supply components; trim address/string inputs before encoding. At minimum show an inline 'invalid argument' error when buildInitCode returns null so the failure isn't silent.

#### [P3] Gas-price math casts wei BigInt to Number, losing precision on high-fee chains  `perf` _(conf:low)_
- **Where:** src/lib/deploy/deploy-store.svelte.ts:574-587 (fetchGasPrices)
- **What:** maxFeeWei/priorityWei are bigint but immediately Number(maxFeeWei) before unit selection. For chains with very large wei values this loses precision; the values only prefill the editable gwei/wei input fields (gasOverrides re-parses the string), so impact is cosmetic, but on extreme values Number() could overflow to a misleading prefill.
- **Fix:** Compute the gwei/wei display string directly from the bigint (e.g. format wei via bigint division) instead of going through Number for values that can exceed 2^53.

### Dead code
- src/lib/evm/network-pool.ts:16 createNetworkPools — exported but never called anywhere (only createEVMPools is consumed). Its sole consumer-helper RPCVendor is therefore also dead.
- src/lib/evm/rpc-vendor.ts:13 RPCVendor (+ RPCInput/RPCOutput) — only referenced by the dead createNetworkPools; no external consumer uses the balance-only RPC vendor path.
- src/lib/deploy/types.ts:62 ChainInfo interface — unused; the store imports ChainInfo from $lib/contract-caller/types instead, not from deploy/types.
- src/lib/deploy/types.ts:106 DeployNetwork interface — defined, never imported/used.
- src/lib/deploy/network-check.ts:172 clearCachedCheck() — exported, never called (no UI path to force-clear a chain's cache; forceRefresh is also never passed by the store).
- src/lib/deploy/history.ts:76 deleteDeployment() — exported, never called (UI only offers clear-all via clearHistory).
- src/lib/vela-chain-setup/deployer-wallet.ts:132 clearStoredWallet() — exported, never imported/called (goBack() only nulls in-memory state; the localStorage key 'vela-chain-setup-deployer' is never cleared, so the throwaway private key persists indefinitely).
- src/lib/chains/wallet.ts:29 hasInjectedWallet() — exported via chains/index.ts barrel, never called by any consumer.

### Duplication
- RPC JSON-RPC helper rpcCall is reimplemented byte-similar in src/lib/deploy/network-check.ts:70, src/lib/vela-chain-setup/contracts.ts:204, and src/lib/contract-caller/networks.ts:118 (plus wallet-sweep/forever/wallet variants). deploy-store already imports rpcCall/probeRpcs/loadChainInfo from contract-caller/networks — the two deploy-area copies should reuse that single source.
- checkP256Precompile + VALID_P256_CALL + P256_PRECOMPILE are duplicated verbatim between src/lib/deploy/network-check.ts:100-122 and src/lib/vela-chain-setup/contracts.ts:222-251. Extract one shared module.
- hasCode (network-check.ts:81 vs contracts.ts:215) and getBalance (network-check.ts:86 vs contracts.ts:253) are identical pairs; consolidate.
- RPC-discovery/probe logic is duplicated three ways: contract-caller/networks.probeRpcs (used by deploy-store) vs vela store.probeAllRpcs (store.svelte.ts:334) + store.findBestRpc (679) + private extractRpcUrls (717), which re-implements contract-caller/networks.extractRpcUrls:84. The two stores' selectChain/switchRpc/applyCustomRpc bodies are near-identical and should share a helper.
- CREATE2 proxy address 0x4e59b44847b379578588920cA78FbF26c0B4956C is hardcoded in 3 spots: create2.ts:16 (CREATE2_PROXY), vela contracts.ts:41 (arachnidProxy.address), and vela store.svelte.ts:635 (local ARACHNID_PROXY const). The Safe singleton-factory 0x914d... is likewise re-literaled in store.svelte.ts:636.
- EVMVendor (evm-vendor.ts) and RPCVendor (rpc-vendor.ts) share an identical classifyError implementation (rate-limit / 5xx / network string matching) — extract a shared classifier.


## widgets (shared UI)

- **Tests:** sparse · **Files reviewed:** 22
- ~13k LOC of shared Svelte 5 components for the wallet/crypto tools: modals (AddNetwork/AddToken/ServiceNodes), entity search boxes, network pickers/grids, contract-caller param/output renderers, ABI viewer, and per-app config/results panels. The newer components (ChainSearch, NetworkGrid, NetworkPicker, SmartParamInput/Output, the two modals) are clean, token-driven, and well-built. Overall health is good, but there is one significant problem area: three of the entity-search widgets (AssetSearch, ContractSearch, plus the dead SearchBox) are near-verbatim copies of each other and hardcode dark-only colors (rgba(255,255,255,…) and #0a0f0d/#ffffff) that break the light theme and lack the a11y/⌘K/reduced-motion treatment the newer ChainSearch already has. There is also a low-severity HTML-injection surface in DeployerActivityLog and pervasive chain-logo/base-URL helper duplication. Only the two modals have tests; the rest of the area (including all contract-caller and ABI rendering logic) is untested.

### Findings

#### [P2] AssetSearch & ContractSearch hardcode dark-only colors — broken in light theme  `ui-design` _(conf:high)_
- **Where:** AssetSearch.svelte:209,224,249,252,258,278; ContractSearch.svelte:205,220,245,248,254,274
- **What:** Both widgets style the input with background: rgba(255,255,255,0.05) / focus rgba(255,255,255,0.08), and the results dropdown with background-color: #0a0f0d plus a :global([data-theme='light']) override to #ffffff and box-shadow rgba(0,0,0,0.6). In light mode the rgba(255,255,255,…) input fill is invisible against a white page and the heavy black shadow is wrong. This directly violates UI-DESIGN-RULES (never hardcode rgba(255,255,255,x)/hex for bg/border; use tokens). ChainSearch.svelte already does this correctly with --bg-elevated/--border-base/--shadow-sm/--shadow-lg — the two older copies were never updated.
- **Fix:** Replace the rgba/hex literals with tokens exactly as ChainSearch does: input bg=--bg-elevated, border=--border-base, focus box-shadow=0 0 0 3px var(--accent-ring); dropdown bg=--bg-elevated, shadow=--shadow-lg; row hover/selected=--bg-sunken. Better: delete both files and replace with a shared EntitySearch based on ChainSearch.

#### [P2] DeployerActivityLog linkify() does not escape double-quotes → href attribute breakout  `security` _(conf:medium)_
- **Where:** DeployerActivityLog.svelte:11-17,29
- **What:** linkify() escapes &,<,> then wraps any https?://… match in <a href="$1" …> and renders via {@html}. It never escapes the double-quote character. Log messages include raw error strings from RPC/verification/build failures (deploy-store.svelte.ts:309,320,504,642,737,798 all do this.log('… ' + e.message)), which are attacker-influenceable (a malicious/compromised custom RPC or block-explorer verify endpoint controls the error text). A message containing a URL with an embedded quote, e.g. https://evil/" onmouseover="alert(1), would close the href and inject an event-handler attribute, yielding DOM XSS in the deployer page. Impact is limited (requires the user to point at a hostile RPC and trigger an error), hence P2, but it is a real injection.
- **Fix:** Escape " (and ideally ') in the escape step, or stop building HTML by hand: render the message as plain text and only linkify by splitting on the URL regex and emitting <a> nodes with bound href (no {@html}). Also validate the matched URL with new URL() and only link http/https.

#### [P3] AbiViewer state/type badges use hardcoded pastel hex — poor contrast in light theme  `ui-design` _(conf:high)_
- **Where:** AbiViewer.svelte:696-734 (.badge-view/-pure/-payable/-nonpayable/-event/-error/-indexed/-anonymous), 874-880 (call result success/error)
- **What:** Eight badges and the call-result boxes use fixed colors like #60a5fa/#a78bfa/#fbbf24/#34d399/#f87171 on rgba(color,0.15) backgrounds, plus rgba(52,211,153,…) success/error boxes. These are tuned for dark mode; in light mode the light pastel text on a 15%-opacity tint has weak contrast and ignores the theme's semantic tokens (--success/--warning/--error/--info, which exist and adapt). Violates the token-driven rule.
- **Fix:** Map the badges to semantic tokens: view/event→--info/--success with --*-muted backgrounds; payable/indexed→--warning; error/anonymous→--error/--fg-muted; pure→--accent. Use the matching *-muted token for the background instead of the hardcoded rgba.

#### [P3] AbiViewer item-header hover uses rgba(255,255,255,0.03) (invisible in light)  `ui-design` _(conf:high)_
- **Where:** AbiViewer.svelte:657
- **What:** .item-header:hover { background: rgba(255,255,255,0.03) } — in light mode white-on-white produces no visible hover affordance. Same class of token violation as the search widgets.
- **Fix:** Use background: var(--bg-raised) (or --bg-sunken) for the row hover, matching the project row-hover convention.

#### [P3] AssetSearch & ContractSearch missing a11y combobox roles, ⌘K, and reduced-motion  `ui-design` _(conf:high)_
- **Where:** AssetSearch.svelte:141-182; ContractSearch.svelte:137-178
- **What:** The search input has no role=combobox/aria-expanded/aria-controls/aria-autocomplete and the results list/options have no listbox/option roles or aria-selected (ChainSearch.svelte:130-154 has all of these). Neither widget supports the global ⌘K focus shortcut ChainSearch provides, and their spin keyframes (AssetSearch:238, ContractSearch:234) have no prefers-reduced-motion guard. Selection is also mouse/keyboard-inconsistent: selectedIndex is only moved by arrow keys, never on hover, so a mouse user pressing Enter gets nothing.
- **Fix:** Adopt ChainSearch's pattern (or replace these with the shared EntitySearch): add the ARIA combobox/listbox/option attributes, the window ⌘K handler, onmouseenter to sync selectedIndex, and a @media (prefers-reduced-motion: reduce) block disabling the spinner.

#### [P3] AddNetworkModal accepts unbounded/garbage decimals while AddTokenModal validates the range  `logic` _(conf:medium)_
- **Where:** AddNetworkModal.svelte:112,118,127
- **What:** handleSubmit reads dec = Number(decimals) and submits Number.isFinite(dec) ? dec : 18 with no range/integer check, so a user can submit decimals like 1e9, -5, or 2.5 for a native currency. AddTokenModal.svelte:75 correctly rejects non-integer / <0 / >36. Inconsistent validation; a bad decimals value silently propagates into balance math downstream.
- **Fix:** Mirror AddTokenModal: validate Number.isInteger(dec) && dec>=0 && dec<=36 and surface t('widgets.addNetwork.errorDecimals') (add the key to all 15 locales) before calling onSubmit.

#### [P3] NetworkPicker host() only strips https:// — http RPCs render the protocol prefix  `ui-design` _(conf:high)_
- **Where:** NetworkPicker.svelte:92-94
- **What:** host(url) = url.replace('https://','').replace(/\/$/,''). For an http:// custom RPC (allowed by AddNetworkModal's /^https?:\/\//) the 'https://' replace is a no-op, so the option/url shows the full 'http://…' string, inconsistent with the trimmed https display. Cosmetic only.
- **Fix:** Use new URL(url).host (with a try/catch fallback) or replace(/^https?:\/\//,'') to strip either scheme.

### Dead code
- SearchBox.svelte (123 LOC) — fully unused repo-wide (no import anywhere; confirmed via grep across the monorepo). It is the only remaining consumer of the retired glassmorphism tokens --glass-bg, --blur-md (backdrop-filter) and --glow-accent (box-shadow), all of which violate the current UI-DESIGN-RULES (no glow/blur). Delete the file.
- AddTokenModal.svelte:8,18 — `networkKey: string` prop is declared in the Props interface and destructured from $props(), but never referenced anywhere in the script or template (only `networkName` is rendered). Dead prop. BalanceRadarConfig.svelte:352 still passes it. Remove the prop and the call-site argument.
- AbiViewer.svelte:711-714 (.badge-nonpayable) and :731-734 (.badge-anonymous) are byte-identical rules (same rgba(156,163,175,0.15)/#9ca3af); likewise :706-709 (.badge-payable) and :726-729 (.badge-indexed) are identical. These could collapse to a shared class, though this is minor.

### Duplication
- AssetSearch.svelte and ContractSearch.svelte are ~95% identical copies (same state vars, loadXData(), searchX(), handleSelect/handleKeydown/handleFocus/handleBlur, shortenAddress, and CSS). ChainSearch.svelte is a third, slightly-improved copy of the same widget. All three duplicate: the inline SVG search icon, the spin keyframes, the result-dropdown markup, and the ETHEREUM_DATA_BASE_URL constant. Extract one generic <EntitySearch> (config: fetch url, item->display mapper, route builder) — ChainSearch is the best base since it already has ⌘K, ARIA combobox roles, reduced-motion, and token-driven colors.
- Chain-logo URL + ethereum-data base URL are implemented twice: $lib/chains/api.ts (getChainLogoUrl, ETHEREUM_DATA_BASE_URL, loadAllChains→fuse-chains.json) and $lib/contract-caller/networks.ts (chainLogoUrl, ETHEREUM_DATA_BASE_URL, loadChainIndex→fuse-chains.json). Widgets pick inconsistently: ChainSearch/NetworkGrid use getChainLogoUrl, NetworkPicker uses chainLogoUrl. Also AssetSearch.svelte:29 and ContractSearch.svelte:26 each re-declare ETHEREUM_DATA_BASE_URL inline. Consolidate on the $lib/chains helpers.
- shortenAddress is reimplemented inline in AssetSearch.svelte:118 and ContractSearch.svelte:114 (identical) while a shared shortenAddress already exists in $lib/contract-caller/format.js (imported by SmartParamInput). Use the shared one.
- spin @keyframes is copy-pasted in AssetSearch, ContractSearch, ChainSearch, and NetworkPicker. A shared spinner component/util would remove four copies (and the three older copies lack the prefers-reduced-motion guard ChainSearch has).


## ui + actions + top-level lib

- **Tests:** sparse · **Files reviewed:** 24
- Shared UI primitives (modals/drawer/datepicker/qr/stepper/progress/disclosure/icons), Svelte actions (portal, fadeInUp), an interrupt queue, and loose top-level lib helpers (i18n, seo, locales, settings, theme, contractReader, btc-updown-strategies). Overall health is good: the portal/fixedoverlay rule is enforced by a build-failing guard test, fadeInUp is well-tested and reduced-motion aware, settings has solid validation/migration, locales has careful Accept-Language matching, and the i18n keys used here are complete across all 15 locales. The main issues are a camera-stream leak on unmount in ScanQrButton, one dead file (ResponsiveDrawer) plus dead theme re-exports, a redundant theme.ts shim duplicating settings.ts, and DatePicker's hardcoded hex/rgba styling that fights the token system. No exploitable security holes in this area (the user-URL proxy path is guarded server-side, out of area).

### Findings

#### [P2] ScanQrButton leaves the camera on when unmounted while scanning  `bug` _(conf:high)_
- **Where:** src/lib/ui/ScanQrButton.svelte:25-53 (no onDestroy/$effect cleanup)
- **What:** startScan() acquires a MediaStream and stores it in `stream`. The stream is only released by stopScan(), which is wired to the close button, backdrop click, scan success, and errors. There is NO component-teardown cleanup. If the component unmounts while scanning is active (e.g. the parent route navigates away, or a parent modal containing the scan button closes the {#if} branch while the camera overlay is open), the Svelte component is destroyed without stopScan() running, so stream.getTracks() are never stopped — the camera/mic indicator stays on and the device stays held. This is the CLAUDE.md 'any async resource needs explicit cancel' lesson: the requestAnimationFrame detect loop also keeps a closure over videoRef/stream.
- **Fix:** Add `import { onDestroy } from 'svelte'` and `onDestroy(stopScan);` (or an `$effect(() => () => stopScan())`). stopScan() is idempotent so this is safe even when already stopped.

#### [P2] DatePicker panel background uses hardcoded hex injected via inline style, plus pervasive hardcoded rgba borders  `ui-design` _(conf:high)_
- **Where:** src/lib/ui/DatePicker.svelte:41-44, 319, 484-535, 575, 577, 653, 688, 829
- **What:** panelBg is derived as literal '#ffffff' (light) / '#1a1e1c' (dark) at lines 42-44 and written into the panel's inline style at line 319 (`background:${panelBg}`). This bypasses tokens (--bg-elevated) and hardcodes a dark value that won't track theme changes after the panel is positioned, and the inline style wins over any CSS. Separately the trigger/preset/nav/day styles use raw rgba(255,255,255,0.0x) for borders/backgrounds (lines 484-535, 575, 653, 688) which are invisible in light mode; they are partially salvaged by explicit :global([data-theme='light']) overrides (lines 729-771) but the box-shadow at line 577 (0 8px 32px rgba(0,0,0,0.4)) and the mobile handle at line 829 have no token equivalent. Violates UI-DESIGN-RULES 'theme tokens only; never hardcode rgba(255,255,255,x)/hex'.
- **Fix:** Drop the panelBg derivation and inline background; set `background: var(--bg-elevated)` in .dp-panel CSS. Replace the rgba literals with --border-base/--bg-raised/--shadow-md tokens and remove the now-redundant light-theme overrides.

#### [P3] normalizeStrategyUrl defaults to http:// which is mixed-content-blocked in production and rejected by the proxy  `bug` _(conf:medium)_
- **Where:** src/lib/btc-updown-strategies.ts:64-75 (used at routes/apps/btc-updown/+page.svelte:903)
- **What:** When a user types a custom strategy host without a scheme, normalizeStrategyUrl prepends `http://`. On the production HTTPS site, a direct fetch('http://host') is blocked by the browser as mixed content; strategyFetch then falls back to /api/proxy, but the proxy returns 403 for any non-HTTPS URL in production (api/proxy/+server.ts:24). Net effect: a bare-hostname custom strategy silently fails to validate/discover with a confusing error, even when the host serves HTTPS fine.
- **Fix:** Default the prepended scheme to `https://` (prepend 'https://' instead of 'http://'). Hosts that are genuinely http-only are unusable in prod anyway due to mixed-content; https-first matches reality.

#### [P3] Disclosure reads prefers-reduced-motion once at init, not reactively  `bug` _(conf:medium)_
- **Where:** src/lib/ui/Disclosure.svelte:30-31
- **What:** `const reduced = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches` is evaluated once when the component is created and `dur` is a plain const. If the user toggles the OS reduced-motion setting while the component is mounted, the slide duration won't update. Minor; fadeInUp.ts has the same single-read pattern but that action re-runs per mount. Cosmetic, low impact.
- **Fix:** If desired, make it reactive with a media-query listener; otherwise acceptable given components are short-lived. Low priority.

#### [P3] InterruptQueue.next() can overwrite a prior pending waiter without resolving it  `logic` _(conf:medium)_
- **Where:** src/lib/async/interrupt-queue.ts:31-46
- **What:** next() unconditionally assigns this.waiting = resolve and this.timeoutId = setTimeout(...). If next() is called twice before either resolves (two concurrent consumers, or a consumer that doesn't await), the second call overwrites this.waiting, orphaning the first promise (it will never resolve) and leaking the first timeout (this.timeoutId is overwritten so clearTimeout can't reach it). The documented usage is a single generator polling sequentially, so this isn't hit today, but it's an unguarded invariant. dispose() also only resolves the single current waiter.
- **Fix:** Guard against re-entrancy: if this.waiting is already set, either reject/resolve(null) the previous waiter and clear its timer before installing the new one, or assert single-consumer. At minimum capture the timer id in the closure so the orphaned timer is still clearable.

#### [P3] contractReader has no per-RPC timeout; isContractDeployed can hang on slow public RPCs  `logic` _(conf:medium)_
- **Where:** src/lib/contractReader.ts:64-106 (callWithFallback / ethCall)
- **What:** ethCall uses bare fetch() with no AbortController/timeout. callWithFallback iterates up to 5 endpoints sequentially; a hanging (not failing) RPC blocks indefinitely before trying the next. This contradicts the repo's own recent commit 'bounded RPC timeouts + read failover' for contract-caller and the CLAUDE.md timeout lessons. subscription-contract.ts:getEthUsdPrice/getSubscriptionInfo (membership UX) depend on this, so a stalled public RPC stalls the subscription badge/check.
- **Fix:** Add an AbortController with a per-call timeout (e.g. 8s) in ethCall, passing signal to fetch and clearing the timer in both branches; on abort, throw so callWithFallback advances to the next RPC.

#### [P3] No tests for settings, locales, contractReader, btc-updown-strategies, or interrupt-queue  `test-gap` _(conf:high)_
- **Where:** src/lib/settings.ts, src/lib/locales.ts, src/lib/contractReader.ts, src/lib/btc-updown-strategies.ts, src/lib/async/interrupt-queue.ts
- **What:** Only fadeInUp and the overlay-portal guard have tests in this area. settings.ts (validation + migration of untrusted localStorage), locales.ts (Accept-Language/zh-region matching — pure and very testable), and btc-updown-strategies.ts (normalizeStrategyUrl, getDiscoveryUrl, migrateAndDedup, validateStrategyUrl state machine) are all pure-ish logic with branching that is currently unverified. interrupt-queue.ts (the re-entrancy concern above) is also untested here (only exercised indirectly via executor specs that mock it).
- **Fix:** Add unit tests at least for locales.resolveLocale/matchTag (region routing, q-sort) and btc-updown-strategies normalizeStrategyUrl/getDiscoveryUrl/migrateAndDedup — these are deterministic and cheap.

#### [P3] ResponsiveDrawer component is entirely unused  `dead-code` _(conf:high)_
- **Where:** src/lib/ui/ResponsiveDrawer.svelte (whole file)
- **What:** grep for ResponsiveDrawer across all of src (excluding its own file) returns zero matches — it is imported and rendered nowhere. It is a near-duplicate of ResponsiveModal (same portal/escape/body-scroll-lock scaffolding). Dead weight that still has to pass the overlay-portal guard test and be maintained.
- **Fix:** Delete src/lib/ui/ResponsiveDrawer.svelte. If a slide-in drawer is needed later, reintroduce via the shared overlay primitive suggested in duplication.

### Dead code
- src/lib/ui/ResponsiveDrawer.svelte — entire component is unused; zero references anywhere in src (grep for ResponsiveDrawer outside its own file returns nothing). It duplicates ResponsiveModal's scaffolding (portal, escape key, body-scroll-lock effect, header/close). Delete it.
- src/lib/theme.ts:13-16 — re-exports cycleTextScale, initTheme (alias initSettings), initTextScale (alias initSettings) are never imported by anyone (0 usages). The only consumer of $lib/theme is ThemeToggle.svelte which imports toggleTheme, setTextScale, getTextScales + 2 types — all also exported directly from $lib/settings. Drop the dead re-exports.
- src/lib/contractReader.ts:142-171 formatDecodedValue — exported but only used by src/lib/widgets/AbiViewer.svelte; fine, but the object branch's numeric-index filter (isNaN(Number(key))) is only reachable from AbiViewer, noting limited surface (not dead, informational).

### Duplication
- src/lib/theme.ts vs src/lib/settings.ts — theme.ts is a thin backward-compat shim that re-exports settings.ts symbols. SettingsPanel.svelte already imports setTheme/setTextScale/getTextScales/types directly from $lib/settings, while ThemeToggle.svelte imports the same from $lib/theme. Pick one source (import from $lib/settings everywhere, delete theme.ts) to remove the parallel surface.
- src/lib/ui/ResponsiveModal.svelte, ResponsiveDrawer.svelte, ConfirmModal.svelte, ScanQrButton.svelte, DatePicker.svelte each re-implement the same overlay scaffolding: handleKeydown(Escape)->close, a $effect that sets document.body.style.overflow='hidden' while open, use:portal, and a backdrop+panel with near-identical fadeIn/scaleIn/slideUp keyframes. Extract a shared overlay primitive (or an action handling escape + body-scroll-lock) so the body-scroll-lock and escape behaviour live in one place. Note ScanQrButton does NOT lock body scroll and has no escape handler, an inconsistency this would also fix.
- src/lib/btc-updown-strategies.ts:64-75 normalizeStrategyUrl and getDiscoveryUrl:80-89 — the /vN regex (/\/v\d+$/ and /\/api\/?$/) logic is also mirrored in migrateAndDedup:127-142; consider a single helper for api-version normalization.


## routes + server entry points

- **Tests:** none · **Files reviewed:** 28
- This area covers the SvelteKit route tree (thin per-app page wrappers under /apps/*, public data pages for chains/assets/contracts, profile, sitemaps), four unauthenticated API endpoints (/api/proxy, /api/wallet, /api/exchange-rate, /api/og), and the i18n/theme middleware in hooks.server.ts. The middleware and most page-server loaders are sound (server-side fetch to a single trusted ethereum-data host). However there are two serious entry-point problems: an unauthenticated open SSRF proxy that forwards arbitrary user-supplied URLs and does NOT block cloud-metadata IPs or follow-redirect bypasses, and a committed debug +page.server.ts that prints DATABASE_URL and API_KEY (real values from .env) to server logs at startup. There is no rate limiting and no security headers (CSP/X-Frame-Options) anywhere. Test coverage of routes/endpoints is effectively nil (one trivial homepage h1 smoke test).

### Findings

#### [P1 (was P0)] Unauthenticated open SSRF in /api/proxy — cloud-metadata + redirect-bypass reachable  `security` _(conf:high)_
- **Where:** src/routes/api/proxy/+server.ts:7-50
- **What:** The GET handler fetches any user-supplied ?url= and streams the full upstream body back to the caller. The isBlockedUrl() denylist is incomplete and bypassable: (1) 169.254.169.254 (AWS/GCP/Azure IMDS metadata endpoint) is NOT in BLOCKED_HOSTS nor any private-range regex, so `GET /api/proxy?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/` returns IAM credentials to any anonymous internet caller. (2) fetch() follows redirects by default, so an attacker-controlled allowed host can 302 → http://localhost/ or →169.254.169.254 and the denylist (which only checks the original URL) never sees it. (3) Alternate IP encodings (decimal http://2130706433/, octal, IPv6 http://[::ffff:127.0.0.1]/, 0x7f.0.0.1) bypass the literal/regex checks. The endpoint is genuinely attacker-driven: it forwards arbitrary strategy URLs that users type (sse.ts:74, btc-updown-strategies.ts:188). Impact: full read-SSRF — exfiltrate cloud metadata/IAM creds, scan/read internal services, pivot into the VPC.
- **Fix:** Root cause: a denylist-based, original-URL-only SSRF guard on an unauthenticated open proxy that follows redirects. Minimal robust fix:
1. Switch to an ALLOWLIST of the hosts the app actually proxies (strategy backends the user configures + any fixed backends like frankfurter). Reject everything else. This is the only durable fix given arbitrary user-supplied URLs.
2. Set fetch(targetUrl, { redirect: 'manual' }) and reject any 3xx (do NOT auto-follow); or re-run the full host/IP validation on every redirect hop.
3. Resolve the hostname to its IP(s) and block if ANY resolves into a private/reserved range — add 169.254.0.0/16 (link-local/IMDS), 100.64.0.0/10 (CGNAT), 127.0.0.0/8 (not just 127.0.0.1), 0.0.0.0/8, fc00::/7, fe80::/10, ::1, and IPv4-mapped IPv6 (::ffff:x). This also defeats DNS-rebinding. Connect to the resolved+validated IP, not re-resolve at fetch time.
4. Require auth or a strict per-IP rate limit on /api/proxy (currently hooks.server.ts:62 lets all /api/ through ungated).
5. Cap response size / add a server-side timeout to prevent the proxy being abused as a download relay.
Note for the author: do NOT rely on adding decimal/hex/octal IP regexes — new URL() already normalizes those to dotted-decimal, so the existing 127.0.0.1 entry catches them; the real gaps are 169.254/100.64/IPv6-mapped, redirect-following, and the missing allowlist.

#### [P2 (was P1)] Secrets (DATABASE_URL, API_KEY) printed to server logs by debug +page.server.ts  `security` _(conf:high)_
- **Where:** src/routes/+page.server.ts:2-6
- **What:** The homepage server module logs `console.log('DATABASE_URL =>', env.DATABASE_URL)` and `console.log('API_KEY =>', env.API_KEY)` (plus PORT). .env contains real values for both. These run at module evaluation (server boot) and dump live credentials into stdout/aggregated logging (log files, Docker logs, log shippers, error-tracking breadcrumbs). Anyone with log access — including third-party log/observability vendors — sees the DB connection string and API key in plaintext. This is the LAUNCH_AUDIT 'secrets in logs' red flag. The file has no load() and provides zero functionality.
- **Fix:** Delete src/routes/+page.server.ts entirely — it is pure debug code (commit 4777f74) with no load() and no functionality. Removing it eliminates the env-logging at module eval and the compiled copy that ships to production. If env-presence verification is ever needed, replace value logging with a boolean and gate it behind dev: `import { dev } from '$app/environment'; if (dev) console.log('DATABASE_URL set?', Boolean(env.DATABASE_URL));` — never log the value. Separately (defense in depth, beyond this finding): ensure the real secrets ALCHEMY_API_KEY/PIMLICO_API_KEY in .env are rotated/not committed and that .env is covered by .gitignore (it is currently untracked but not explicitly ignore-listed).

#### [P2] No rate limiting on CPU/network-heavy unauthenticated endpoints (/api/og, /api/proxy, /api/wallet)  `security` _(conf:medium)_
- **Where:** src/routes/api/og/+server.ts:128; src/routes/api/proxy/+server.ts:32; src/routes/api/wallet/+server.ts:42
- **What:** None of the API endpoints (and no global hook) apply any rate limiting. /api/og does heavy per-request work — loads fonts + WASM, runs satori SVG generation, then resvg PNG raster — driven by fully attacker-controlled query params (title/subtitle/gradient with no length cap). /api/proxy makes an outbound request per call and streams arbitrary bytes. /api/wallet proxies to Alchemy on a paid key (?address=) for any caller. An attacker can hammer /api/og?title=<huge> to exhaust CPU/event loop (DoS) and /api/wallet to burn the Alchemy quota / inflate the bill. hooks.server.ts also short-circuits /api/ before any cross-cutting control could run.
- **Fix:** Add a lightweight per-IP rate limiter (token bucket keyed on getClientAddress()) in hooks.server.ts for /api/* paths, or per-endpoint. Cap og param lengths (e.g. title<=200 chars). Consider caching/queuing og generation.

#### [P2] No security response headers (CSP, X-Frame-Options, X-Content-Type-Options) set anywhere  `security` _(conf:medium)_
- **Where:** src/hooks.server.ts:119-128
- **What:** The handle hook sets no security headers and svelte.config.js defines no CSP. The app is a wallet/DeFi tool handling keys, signatures and balances, yet pages can be framed (clickjacking on sign/sweep/revoke flows), have no CSP to mitigate XSS, and no nosniff. Given the sensitive on-chain actions (token-sender, wallet-sweep, revoke) this materially raises the blast radius of any injected script or UI-redress attack.
- **Fix:** In hooks.server.ts after resolve(), set on the response: `X-Frame-Options: DENY` (or a frame-ancestors CSP), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a Content-Security-Policy (SvelteKit supports csp config in svelte.config.js for nonce-based CSP). Exclude OG/image responses as needed.

#### [P2] Page-server loaders interpolate route params into upstream URLs without validation (path-injection)  `bug` _(conf:medium)_
- **Where:** src/routes/contracts/[chainId]/[address]/+page.server.ts:42-65; src/routes/assets/[chainId]/[address]/+page.server.ts:28; src/routes/chains/[chainID]/+page.server.ts:11
- **What:** params.chainId / params.address / params.chainID are placed directly into the ethereum-data fetch path (e.g. `${BASE}/contracts/eip155-${chainId}/${address}/info.json`). SvelteKit decodes %2F, so an address like `..%2f..%2fadmin` or a chainId containing `../` lets the path escape the intended prefix on the trusted host (and `address` could contain a full `@host` only if scheme present — here it's path-only so SSRF to other hosts is not possible, but it can fetch arbitrary unintended paths on ethereum-data, and the unsanitized values are then echoed back into the returned data/SEO). Not exploitable for cross-host SSRF, but it is unvalidated trust-boundary input reaching a server fetch.
- **Fix:** Validate before fetching: `if (!/^\d+$/.test(chainId)) error(400)` and `if (!/^0x[0-9a-fA-F]{40}$/.test(address)) error(404)` (mirror the regex already used correctly in /api/wallet:45). Reject otherwise instead of constructing the URL.

#### [P2] Sitemap XML built from external data with no entity escaping  `bug` _(conf:medium)_
- **Where:** src/routes/sitemap-contracts.xml/+server.ts:16-33; src/routes/sitemap-assets.xml/+server.ts:19-36; src/routes/sitemap-chains.xml/+server.ts:17-34
- **What:** generateUrl() string-concatenates chainId/address from the external fuse-*.json feed straight into <loc> without XML-escaping. If any feed value contains `&`, `<`, or `>` (e.g. an address field with stray chars, or future feed shape changes), the produced sitemap is malformed XML and crawlers reject the whole file. The data is currently semi-trusted (third-party host ethereum-data.awesometools.dev), so a compromise/typo there breaks all of SEO indexing.
- **Fix:** Add an xmlEscape() helper (& → &amp; etc.) and wrap every interpolated value, or validate chainId is numeric and address matches /^0x[0-9a-fA-F]{40}$/ and skip non-conforming entries.

#### [P3] +error.svelte uses hardcoded rgba(255,255,255,*) cards and glow/blur orbs (token + motion rule violations)  `ui-design` _(conf:high)_
- **Where:** src/routes/+error.svelte:107-130,236-247
- **What:** The explore cards use `background: rgba(255,255,255,0.05)` / `border: 1px solid rgba(255,255,255,0.08)` and hover `rgba(255,255,255,0.08/0.12)` — invisible/incorrect in light mode (UI-DESIGN-RULES: never hardcode rgba white for bg/border). It also renders two `.bg-orb` elements with `filter: blur(100px)` radial-gradient glows, which the retired glass/glow guidance explicitly forbids. The back-btn hover also hardcodes `box-shadow: 0 4px 12px rgba(54,160,122,0.25)`.
- **Fix:** Replace card bg/border with --bg-elevated + --border-base + --shadow-sm, hover with --bg-raised + --border-strong + --shadow-md; remove the .bg-orb elements (or use a token-based subtle backdrop); replace the hardcoded green shadow with --shadow-md.

#### [P3] App route 'thin wrappers' contain thousands of lines of business logic  `coupling` _(conf:medium)_
- **Where:** src/routes/apps/btc-updown/+page.svelte (4171 lines); src/routes/apps/vela-wallet-chain-setup/+page.svelte (1827); src/routes/apps/token-sender/+page.svelte (1453); src/routes/apps/revoke/+page.svelte (1118)
- **What:** Project architecture (CLAUDE.md / memory) states routes should be thin wrappers importing from $lib adapters, with logic in $lib/pda-apps/* or $lib/<app>/. Several /apps routes instead embed the full app (state machine, signing, network calls) directly in +page.svelte. This couples logic to the route, blocks reuse by the CLI/MCP adapters, and is untestable in isolation. Not a runtime bug but a maintainability/architecture-consistency issue worth flagging for the largest offenders.
- **Fix:** Incrementally extract the non-presentational logic (data fetching, tx building, store) into $lib/<app>/ modules and reduce the route to a thin wrapper, matching the balance-radar/chat pattern.

#### [P3] Module-level mutable rate/og caches are unbounded and process-global (minor)  `logic` _(conf:low)_
- **Where:** src/routes/api/exchange-rate/+server.ts:14; src/routes/api/og/+server.ts:29
- **What:** exchange-rate keeps a single module-level `cache` and og keeps an unbounded `fontCache` Map. These are fine for the fixed font/currency sets here, but they are shared mutable state at module scope; the og fontCache only ever holds the 2 default fonts so growth is bounded, and rate cache is a single object — acceptable. Noting for completeness: no correctness bug, just be aware these persist for the server lifetime and are not per-request isolated.
- **Fix:** No change required; if more dynamic fonts/currencies are ever added, bound the cache size.

### Dead code
- src/routes/+page.server.ts — entire file is leftover debug code (commit 4777f74 'Add debug logging to verify environment variables loading'); it has no load() export and only console.logs env vars. Serves no functional purpose and leaks secrets — delete the whole file.
- src/routes/forever-prf-test/+page.svelte — developer-only WebAuthn PRF probe page (self-described 'developer test page', Phase 0a spike) shipped to production with no dev guard; reachable at /forever-prf-test and crawlable (robots.txt allows all). Should be removed or gated behind import.meta.env.DEV.
- src/routes/api/wallet/+server.ts:34-40 — KNOWN_SYMBOLS set is only used for the spam heuristic; fine, but note env.API_KEY / env.DATABASE_URL referenced in +page.server.ts are never used anywhere else in the codebase (only ALCHEMY_API_KEY is actually consumed).

### Duplication
- i18n route-namespace resolution logic is duplicated verbatim between src/hooks.server.ts (lines 77-93, matchRoute + parent-path walk + loadAndMergeMessages) and src/routes/+layout.ts (lines 28-54, matchRoute + identical parent-path walk + loadMessagesForRoute). Both also re-implement the same 'EN base + locale overlay' merge and the same import.meta.glob message loader. Extract a single shared helper (e.g. $lib/i18n/resolve-route-messages.ts) used by both SSR and client.
- Five sitemap +server.ts files (sitemap-static/chains/assets/contracts + index) each re-declare BASE_URL, LOCALES, DEFAULT_LOCALE, ETHEREUM_DATA_BASE_URL and a near-identical generateUrl()/<urlset> wrapper. Factor the URL-entry and urlset-envelope builders into one shared module.
- Proxy-fallback fetch pattern `fetch(`/api/proxy?url=${encodeURIComponent(url)}`)` is duplicated in src/lib/btc-updown-strategies.ts:188, src/lib/updown-shared/sse.ts:74, and src/routes/apps/btc-updown/+page.svelte:399-402. Consolidate into one strategyFetch helper (one already exists in btc-updown-strategies.ts).

