# Event Scanner CLI

Scan and decode contract event logs from the terminal (Bun).

```
bun run pda:event-scanner -- --config-file scan.json [--non-interactive]
```

Because the input has nested objects (network, ABI, filter sets), a `--config-file`
is the practical way to drive it. The CLI prints a summary
(`scanId`, `eventCount`, `scannedBlocks`, `duration`); full event browsing and
CSV/JSON download live in the web app (IndexedDB is browser-only).

## Config file

```json
{
  "network": {
    "key": "chain-56",
    "name": "BNB Smart Chain",
    "chainId": 56,
    "rpcs": ["https://bsc-rpc.publicnode.com", "https://binance.llamarpc.com"],
    "symbol": "BNB",
    "decimals": 18,
    "explorerUrl": "https://bscscan.com"
  },
  "contract": "0x55d398326f99059fF775485246999027B3197955",
  "abi": [
    { "type": "event", "name": "Transfer", "anonymous": false, "inputs": [
      { "name": "from", "type": "address", "indexed": true },
      { "name": "to", "type": "address", "indexed": true },
      { "name": "value", "type": "uint256", "indexed": false }
    ] }
  ],
  "eventName": "Transfer",
  "eventSignature": "Transfer(address,address,uint256)",
  "topic0": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  "filterSets": [
    { "id": "all", "topics": ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"] }
  ],
  "fromBlock": 105800000,
  "toBlock": 105800020,
  "chunkSize": 5000,
  "scanName": "USDT BSC sample"
}
```

### Track a wallet's transfers (in + out)

Replace `filterSets` with two sets — the wallet padded to a 32-byte topic
(`0x` + 24 zeros + the 40-hex address, lowercased):

```json
"filterSets": [
  { "id": "out", "topics": ["0xddf2…", "0x000000000000000000000000<wallet>", null] },
  { "id": "in",  "topics": ["0xddf2…", null, "0x000000000000000000000000<wallet>"] }
]
```

### Resolve the range by time instead of blocks

Omit `fromBlock`/`toBlock` and pass `range`:

```json
"range": { "kind": "lastNDays", "days": 7 }
```

Concrete `fromBlock`/`toBlock` give a **stable, resumable** scan id; a time range
re-resolves against the current head each run (so it becomes a new scan).

## Resume

Re-running the same config (same blocks) finds the existing task by merkle root and
resumes — already-completed chunks are not re-fetched. Stored at `taskhub.db` in the
working directory (Bun SQLite).

## Notes

- ERC-7708 native-transfer scanning: verify the emitter address per chain (draft standard).
- A single block with more logs than the RPC returns in one call may be truncated
  (a warning is logged).
