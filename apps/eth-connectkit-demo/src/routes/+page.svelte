<script lang="ts">
  import { walletState, connectKit, chains, getChainName, shortenAddress } from '$lib/connectkit.svelte';
  import type { RemoteInjectConnector } from '@shelchin/eth-connectkit';
  import QRCode from 'qrcode';

  let connecting = $state<string | null>(null);
  let error = $state<string | null>(null);
  let remoteSession = $state<{ qrCode: string; url: string } | null>(null);
  let copied = $state(false);

  // Wallet interaction state
  let messageToSign = $state('Hello, Ethereum!');
  let signedMessage = $state<string | null>(null);
  let signing = $state(false);

  // Derived state from wallet
  const wallet = $derived(walletState.value);

  async function connect(connectorId: string, target?: string) {
    connecting = target ?? connectorId;
    error = null;
    remoteSession = null;

    try {
      if (connectorId === 'remote-inject') {
        const connector = connectKit.getConnector('remote-inject') as RemoteInjectConnector;

        // Start connecting - this creates session and waits for wallet
        const connectPromise = connectKit.connect(connectorId);

        // Poll for session to be ready (max 5 seconds)
        let session = null;
        for (let i = 0; i < 50; i++) {
          await new Promise((r) => setTimeout(r, 100));
          session = connector.getSession();
          if (session?.url) break;
        }

        if (session?.url) {
          // Generate QR code from URL
          const qrCode = await QRCode.toDataURL(session.url, {
            width: 256,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
          });
          remoteSession = { qrCode, url: session.url };
        }

        // Wait for wallet to actually connect
        await connectPromise;

        // Connected - clear QR and show account info
        remoteSession = null;
      } else {
        await connectKit.connect(connectorId, target ? { target } : undefined);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      remoteSession = null;
    } finally {
      connecting = null;
    }
  }

  async function connectDiscoveredWallet(rdns: string) {
    await connect('injected', rdns);
  }

  async function disconnect() {
    await connectKit.disconnect();
    remoteSession = null;
    signedMessage = null;
  }

  async function switchChain(chainId: number) {
    try {
      await connectKit.switchChain(chainId);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function switchAccount(account: string) {
    connectKit.getState();
    connectKit.switchAccount(account as `0x${string}`);
  }

  function cancelRemoteConnect() {
    remoteSession = null;
    connecting = null;
    connectKit.disconnect();
  }

  async function copyLink() {
    if (!remoteSession?.url) return;
    try {
      await navigator.clipboard.writeText(remoteSession.url);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = remoteSession.url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  }

  async function signMessage() {
    if (!messageToSign.trim()) return;

    signing = true;
    error = null;
    signedMessage = null;

    try {
      const signature = await connectKit.signMessage(messageToSign);
      signedMessage = signature;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      signing = false;
    }
  }

  // Safe stringify for debug
  function safeStringify(obj: unknown): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (key === 'provider') return '[Provider]';
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    }, 2);
  }
</script>

<main>
  <h1>ETH ConnectKit Demo</h1>
  <p class="subtitle">UI-agnostic Ethereum wallet connection library</p>

  {#if wallet.status === 'connected'}
    <div class="card connected">
      <div class="status-badge">Connected</div>

      <div class="info-row">
        <span class="label">Address</span>
        <span class="value">{shortenAddress(wallet.address)}</span>
      </div>

      {#if wallet.accounts.length > 1}
        <div class="info-row">
          <span class="label">Accounts</span>
          <div class="accounts-list">
            {#each wallet.accounts as account}
              <button
                class="account-btn"
                class:active={wallet.address === account}
                onclick={() => switchAccount(account)}
              >
                {shortenAddress(account)}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="info-row">
        <span class="label">Chain</span>
        <span class="value">{getChainName(wallet.chainId)}</span>
      </div>

      <div class="info-row">
        <span class="label">Connector</span>
        <span class="value">{wallet.connectorId}</span>
      </div>

      <div class="chain-selector">
        <span class="label">Switch Chain</span>
        <div class="chain-buttons">
          {#each chains as chain}
            <button
              class="chain-btn"
              class:active={wallet.chainId === chain.id}
              onclick={() => switchChain(chain.id)}
            >
              {chain.name}
            </button>
          {/each}
        </div>
      </div>

      <!-- Wallet Interactions -->
      <div class="interactions">
        <h3>Wallet Interactions</h3>

        <div class="interaction-section">
          <label for="message">Sign Message</label>
          <div class="input-row">
            <input
              id="message"
              type="text"
              bind:value={messageToSign}
              placeholder="Enter message to sign"
            />
            <button
              class="action-btn"
              disabled={signing || !messageToSign.trim()}
              onclick={signMessage}
            >
              {#if signing}
                <span class="spinner small"></span>
              {:else}
                Sign
              {/if}
            </button>
          </div>

          {#if signedMessage}
            <div class="signature-result">
              <span class="label">Signature</span>
              <code>{signedMessage.slice(0, 20)}...{signedMessage.slice(-20)}</code>
            </div>
          {/if}
        </div>
      </div>

      <button class="disconnect-btn" onclick={disconnect}>Disconnect</button>
    </div>
  {:else}
    <div class="card">
      {#if remoteSession}
        <div class="qr-section">
          <h3>Scan with your mobile wallet</h3>
          <img src={remoteSession.qrCode} alt="QR Code" class="qr-code" />

          <div class="link-section">
            <p class="qr-hint">Or copy link to open on mobile:</p>
            <div class="link-row">
              <input type="text" readonly value={remoteSession.url} class="link-input" />
              <button class="copy-btn" onclick={copyLink}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <p class="waiting-hint">Waiting for mobile wallet to connect...</p>
          <button class="cancel-btn" onclick={cancelRemoteConnect}>Cancel</button>
        </div>
      {:else}
        <h2>Connect Wallet</h2>

        <div class="connectors">
          {#each wallet.connectors as connector}
            <button
              class="connector-btn"
              disabled={connecting !== null}
              onclick={() => connect(connector.id)}
            >
              {#if connecting === connector.id}
                <span class="spinner"></span>
              {/if}
              <span class="connector-name">{connector.name}</span>
              <span class="connector-type">{connector.type}</span>
            </button>
          {/each}
        </div>

        {#if wallet.discoveredWallets.length > 0}
          <div class="discovered">
            <h3>Discovered Wallets (EIP-6963)</h3>
            <div class="discovered-list">
              {#each wallet.discoveredWallets as discoveredWallet}
                <button
                  class="discovered-wallet"
                  disabled={connecting !== null}
                  onclick={() => connectDiscoveredWallet(discoveredWallet.info.rdns)}
                >
                  {#if connecting === discoveredWallet.info.rdns}
                    <span class="spinner small"></span>
                  {:else}
                    <img src={discoveredWallet.info.icon} alt={discoveredWallet.info.name} class="wallet-icon" />
                  {/if}
                  <span>{discoveredWallet.info.name}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/if}

      {#if error}
        <div class="error">{error}</div>
      {/if}

      {#if wallet.isReconnecting}
        <div class="reconnecting">Reconnecting...</div>
      {/if}
    </div>
  {/if}

  <div class="state-debug">
    <h3>State</h3>
    <pre>{safeStringify(wallet)}</pre>
  </div>
</main>

<style>
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 40px 20px;
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 600;
  }

  .subtitle {
    color: #888;
    margin: 8px 0 32px;
  }

  .card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 24px;
  }

  .card.connected {
    border-color: rgba(52, 199, 89, 0.3);
  }

  .status-badge {
    display: inline-block;
    background: rgba(52, 199, 89, 0.15);
    color: #34c759;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 20px;
  }

  h2 {
    margin: 0 0 20px;
    font-size: 20px;
    font-weight: 500;
  }

  h3 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 500;
    color: #888;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .label {
    color: #888;
    font-size: 14px;
  }

  .value {
    font-family: 'SF Mono', monospace;
    font-size: 14px;
  }

  .accounts-list {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .account-btn {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fafafa;
    padding: 4px 10px;
    border-radius: 6px;
    font-family: 'SF Mono', monospace;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .account-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .account-btn.active {
    background: rgba(0, 122, 255, 0.2);
    border-color: rgba(0, 122, 255, 0.5);
    color: #0a84ff;
  }

  .chain-selector {
    margin-top: 20px;
  }

  .chain-buttons {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .chain-btn {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fafafa;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s ease;
  }

  .chain-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .chain-btn.active {
    background: rgba(0, 122, 255, 0.2);
    border-color: rgba(0, 122, 255, 0.5);
    color: #0a84ff;
  }

  .interactions {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .interaction-section {
    margin-top: 16px;
  }

  .interaction-section label {
    display: block;
    color: #888;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .input-row {
    display: flex;
    gap: 8px;
  }

  .input-row input {
    flex: 1;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px 12px;
    color: #fafafa;
    font-size: 14px;
  }

  .input-row input:focus {
    outline: none;
    border-color: rgba(0, 122, 255, 0.5);
  }

  .action-btn {
    background: rgba(0, 122, 255, 0.15);
    border: 1px solid rgba(0, 122, 255, 0.3);
    color: #0a84ff;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .action-btn:hover:not(:disabled) {
    background: rgba(0, 122, 255, 0.25);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .signature-result {
    margin-top: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
  }

  .signature-result .label {
    display: block;
    margin-bottom: 6px;
  }

  .signature-result code {
    font-family: 'SF Mono', monospace;
    font-size: 12px;
    color: #34c759;
    word-break: break-all;
  }

  .disconnect-btn {
    width: 100%;
    margin-top: 24px;
    padding: 14px;
    background: rgba(255, 59, 48, 0.1);
    border: 1px solid rgba(255, 59, 48, 0.3);
    color: #ff453a;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .disconnect-btn:hover {
    background: rgba(255, 59, 48, 0.15);
  }

  .connectors {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .connector-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    color: #fafafa;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .connector-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
  }

  .connector-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .connector-name {
    flex: 1;
    text-align: left;
    font-size: 15px;
    font-weight: 500;
  }

  .connector-type {
    color: #666;
    font-size: 12px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 14px;
    height: 14px;
    border-width: 2px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .qr-section {
    text-align: center;
  }

  .qr-section h3 {
    margin: 0 0 20px;
    font-weight: 500;
    color: #fafafa;
  }

  .qr-code {
    width: 200px;
    height: 200px;
    border-radius: 12px;
    background: #fff;
    padding: 8px;
  }

  .link-section {
    margin-top: 20px;
  }

  .qr-hint {
    color: #666;
    font-size: 13px;
    margin: 0 0 8px;
  }

  .link-row {
    display: flex;
    gap: 8px;
    max-width: 320px;
    margin: 0 auto;
  }

  .link-input {
    flex: 1;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 8px 12px;
    color: #888;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .copy-btn {
    background: rgba(0, 122, 255, 0.15);
    border: 1px solid rgba(0, 122, 255, 0.3);
    color: #0a84ff;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .copy-btn:hover {
    background: rgba(0, 122, 255, 0.25);
  }

  .waiting-hint {
    color: #888;
    font-size: 13px;
    margin: 20px 0 0;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }

  .cancel-btn {
    margin-top: 16px;
    padding: 12px 24px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #888;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .cancel-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .discovered {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .discovered-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .discovered-wallet {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    font-size: 13px;
    color: #fafafa;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .discovered-wallet:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .discovered-wallet:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .wallet-icon {
    width: 20px;
    height: 20px;
    border-radius: 4px;
  }

  .error {
    margin-top: 16px;
    padding: 12px;
    background: rgba(255, 59, 48, 0.1);
    border: 1px solid rgba(255, 59, 48, 0.2);
    border-radius: 8px;
    color: #ff453a;
    font-size: 13px;
  }

  .reconnecting {
    margin-top: 16px;
    text-align: center;
    color: #888;
    font-size: 14px;
  }

  .state-debug {
    margin-top: 32px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
  }

  .state-debug h3 {
    margin: 0 0 12px;
    font-size: 12px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .state-debug pre {
    margin: 0;
    font-family: 'SF Mono', monospace;
    font-size: 11px;
    color: #888;
    overflow-x: auto;
  }
</style>
