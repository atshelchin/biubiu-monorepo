<script lang="ts">
  /**
   * NetworkTokenInput - Combined network and token selector
   *
   * Features:
   * - Built-in network presets with multiple RPCs
   * - Add custom networks with chainId validation
   * - Edit/add/remove RPC URLs
   * - Token selection linked to network
   * - Add custom ERC20 tokens (auto-fetch metadata from contract)
   * - Three input modes: guided, standard, expert
   */
  import type { InputStep, InputMode } from '@shelchin/pda-sveltekit';
  import { StepNavigator } from '@shelchin/pda-sveltekit';
  import {
    BUILTIN_NETWORKS,
    BUILTIN_TOKENS,
    verifyRpcChainId,
    fetchERC20Metadata,
    type NetworkConfig,
    type TokenConfig,
    type NetworkTokenConfig,
  } from '$lib/send-transaction-app';

  interface Props {
    value?: NetworkTokenConfig;
    onChange: (value: NetworkTokenConfig) => void;
    disabled?: boolean;
    /** Input mode: guided (step-by-step), standard (conditional reveal), expert (all visible) */
    mode?: InputMode;
  }

  let { value, onChange, disabled = false, mode = 'standard' }: Props = $props();

  // Progressive input steps (for guided mode)
  let currentStep = $state(0);

  const steps: InputStep[] = [
    {
      id: 'network',
      title: 'Select Network',
      description: 'Choose the blockchain network for your transaction',
    },
    {
      id: 'token',
      title: 'Select Token',
      description: 'Choose which token to send',
    },
  ];

  // Local state for networks and tokens (includes custom ones)
  let networks = $state<NetworkConfig[]>([...BUILTIN_NETWORKS]);
  let customTokens = $state<Record<number, TokenConfig[]>>({});

  // Derived: current selection (must be defined before canProceed)
  let selectedNetwork = $derived(value?.network);
  let selectedToken = $derived(value?.token);

  // Step validation (depends on selectedNetwork/selectedToken)
  let canProceed = $derived(currentStep === 0 ? !!selectedNetwork : !!selectedToken);
  let stepError = $derived.by(() => {
    if (currentStep === 0 && !selectedNetwork) {
      return undefined; // No error initially
    }
    return undefined;
  });

  // UI state
  let showAddNetwork = $state(false);
  let showEditRpcs = $state(false);
  let showAddToken = $state(false);
  let editingNetworkIndex = $state<number | null>(null);

  // Form state for adding custom network
  let newNetwork = $state({
    chainId: undefined as number | undefined,
    name: '',
    rpcUrls: [''],
    nativeSymbol: '',
    explorerUrl: '',
  });

  // Validation state for network
  let networkValidation = $state({
    isValidating: false,
    error: '',
    verified: false,
  });

  // Form state for adding custom token
  let newTokenAddress = $state('');
  let tokenValidation = $state({
    isValidating: false,
    error: '',
    fetchedToken: null as TokenConfig | null,
  });

  // Edit RPCs state
  let editingRpcs = $state<string[]>([]);

  // Derived: available tokens for selected network
  let availableTokens = $derived.by(() => {
    if (!selectedNetwork) return [];
    const chainId = selectedNetwork.chainId;
    const builtIn = BUILTIN_TOKENS[chainId] || [];
    const custom = customTokens[chainId] || [];
    // If no tokens defined, create native token from network
    if (builtIn.length === 0 && custom.length === 0) {
      return [
        {
          type: 'native' as const,
          symbol: selectedNetwork.nativeSymbol,
          name: selectedNetwork.nativeSymbol,
          decimals: 18,
        },
      ];
    }
    return [...builtIn, ...custom];
  });

  // Select network
  function selectNetwork(network: NetworkConfig) {
    const chainId = network.chainId;
    const tokens = BUILTIN_TOKENS[chainId] || [];
    const custom = customTokens[chainId] || [];
    const allTokens = [...tokens, ...custom];

    const defaultToken: TokenConfig = allTokens[0] || {
      type: 'native',
      symbol: network.nativeSymbol,
      name: network.nativeSymbol,
      decimals: 18,
    };

    onChange({ network, token: defaultToken });
  }

  // Select token
  function selectToken(token: TokenConfig) {
    if (!selectedNetwork) return;
    onChange({ network: selectedNetwork, token });
  }

  // Add RPC URL input
  function addRpcInput() {
    newNetwork.rpcUrls = [...newNetwork.rpcUrls, ''];
  }

  // Remove RPC URL input
  function removeRpcInput(index: number) {
    if (newNetwork.rpcUrls.length > 1) {
      newNetwork.rpcUrls = newNetwork.rpcUrls.filter((_, i) => i !== index);
    }
  }

  // Validate and add custom network
  async function validateAndAddNetwork() {
    const validRpcs = newNetwork.rpcUrls.filter((url) => url.trim());
    if (
      !newNetwork.chainId ||
      !newNetwork.name ||
      validRpcs.length === 0 ||
      !newNetwork.nativeSymbol
    ) {
      networkValidation.error = 'Please fill in all required fields';
      return;
    }

    networkValidation.isValidating = true;
    networkValidation.error = '';

    try {
      // Verify chainId with first RPC
      const result = await verifyRpcChainId(validRpcs[0], newNetwork.chainId);
      if (!result.valid) {
        networkValidation.error = result.error || 'RPC validation failed';
        networkValidation.isValidating = false;
        return;
      }

      const network: NetworkConfig = {
        chainId: newNetwork.chainId,
        name: newNetwork.name,
        rpcUrls: validRpcs,
        nativeSymbol: newNetwork.nativeSymbol,
        explorerUrl: newNetwork.explorerUrl || undefined,
      };

      networks = [...networks, network];
      showAddNetwork = false;
      newNetwork = { chainId: undefined, name: '', rpcUrls: [''], nativeSymbol: '', explorerUrl: '' };
      networkValidation = { isValidating: false, error: '', verified: false };

      selectNetwork(network);
    } catch (err) {
      networkValidation.error = (err as Error).message;
    } finally {
      networkValidation.isValidating = false;
    }
  }

  // Open edit RPCs modal
  function openEditRpcs(index: number) {
    editingNetworkIndex = index;
    editingRpcs = [...networks[index].rpcUrls];
    showEditRpcs = true;
  }

  // Add RPC to editing list
  function addEditingRpc() {
    editingRpcs = [...editingRpcs, ''];
  }

  // Remove RPC from editing list
  function removeEditingRpc(index: number) {
    if (editingRpcs.length > 1) {
      editingRpcs = editingRpcs.filter((_, i) => i !== index);
    }
  }

  // Save RPCs
  function saveRpcs() {
    if (editingNetworkIndex === null) return;

    const validRpcs = editingRpcs.filter((url) => url.trim());
    if (validRpcs.length === 0) return;

    const network = networks[editingNetworkIndex];
    const updated = { ...network, rpcUrls: validRpcs };
    networks = networks.map((n, i) => (i === editingNetworkIndex ? updated : n));

    if (selectedNetwork?.chainId === updated.chainId) {
      onChange({ network: updated, token: selectedToken! });
    }

    showEditRpcs = false;
    editingNetworkIndex = null;
    editingRpcs = [];
  }

  // Fetch and validate ERC20 token
  async function fetchTokenMetadata() {
    if (!selectedNetwork || !newTokenAddress.trim()) {
      tokenValidation.error = 'Please enter a contract address';
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(newTokenAddress)) {
      tokenValidation.error = 'Invalid contract address format';
      return;
    }

    tokenValidation.isValidating = true;
    tokenValidation.error = '';
    tokenValidation.fetchedToken = null;

    try {
      const result = await fetchERC20Metadata(selectedNetwork.rpcUrls[0], newTokenAddress);

      if (!result.valid || !result.data) {
        tokenValidation.error = result.error || 'Failed to fetch token metadata';
        tokenValidation.isValidating = false;
        return;
      }

      tokenValidation.fetchedToken = {
        type: 'erc20',
        symbol: result.data.symbol,
        name: result.data.name,
        decimals: result.data.decimals,
        contractAddress: newTokenAddress,
      };
    } catch (err) {
      tokenValidation.error = (err as Error).message;
    } finally {
      tokenValidation.isValidating = false;
    }
  }

  // Add the fetched token
  function addFetchedToken() {
    if (!selectedNetwork || !tokenValidation.fetchedToken) return;

    const chainId = selectedNetwork.chainId;
    customTokens = {
      ...customTokens,
      [chainId]: [...(customTokens[chainId] || []), tokenValidation.fetchedToken],
    };

    selectToken(tokenValidation.fetchedToken);
    closeAddTokenModal();
  }

  // Close add token modal
  function closeAddTokenModal() {
    showAddToken = false;
    newTokenAddress = '';
    tokenValidation = { isValidating: false, error: '', fetchedToken: null };
  }
</script>

<div class="network-token-input" class:expert-mode={mode === 'expert'}>
  <!-- ============================================ -->
  <!-- GUIDED MODE: Step-by-step with StepNavigator -->
  <!-- ============================================ -->
  {#if mode === 'guided'}
    <StepNavigator
      {steps}
      {currentStep}
      {canProceed}
      {stepError}
      onStepChange={(index) => currentStep = index}
      {disabled}
    >
      <!-- Step 1: Network Selection -->
      {#if currentStep === 0}
        <div class="section">
          <div class="section-header">
            <span class="section-label">Choose a network</span>
            <button type="button" class="add-btn" onclick={() => (showAddNetwork = true)} {disabled}>
              + Add Network
            </button>
          </div>

          <div class="network-grid">
            {#each networks as network, index}
              <div
                class="network-chip"
                class:selected={selectedNetwork?.chainId === network.chainId}
                class:disabled
                role="button"
                tabindex={disabled ? -1 : 0}
                onclick={() => !disabled && selectNetwork(network)}
                onkeydown={(e) => e.key === 'Enter' && !disabled && selectNetwork(network)}
              >
                <span class="network-name">{network.name}</span>
                <span class="network-symbol">{network.nativeSymbol}</span>
                <button
                  type="button"
                  class="edit-rpc-btn"
                  onclick={(e) => { e.stopPropagation(); openEditRpcs(index); }}
                  title="Edit RPC URLs"
                  {disabled}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>

          {#if selectedNetwork}
            <div class="selection-summary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Selected: <strong>{selectedNetwork.name}</strong></span>
              <span class="rpc-info">({selectedNetwork.rpcUrls.length} RPC{selectedNetwork.rpcUrls.length > 1 ? 's' : ''})</span>
            </div>
          {:else}
            <div class="hint-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>Select a network to continue. You can add custom networks if yours isn't listed.</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Step 2: Token Selection -->
      {#if currentStep === 1 && selectedNetwork}
        <div class="section">
          <div class="section-header">
            <span class="section-label">Choose a token on {selectedNetwork.name}</span>
            <button type="button" class="add-btn" onclick={() => (showAddToken = true)} {disabled}>
              + Add Token
            </button>
          </div>

          <div class="token-grid">
            {#each availableTokens as token}
              <button
                type="button"
                class="token-chip"
                class:selected={selectedToken?.symbol === token.symbol &&
                  selectedToken?.contractAddress === token.contractAddress}
                onclick={() => selectToken(token)}
                {disabled}
              >
                <span class="token-symbol">{token.symbol}</span>
                <span class="token-type">{token.type === 'native' ? 'Native' : 'ERC20'}</span>
              </button>
            {/each}
          </div>

          {#if selectedToken}
            <div class="selection-summary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Selected: <strong>{selectedToken.symbol}</strong></span>
              {#if selectedToken.type === 'erc20' && selectedToken.contractAddress}
                <span class="contract-info">{selectedToken.contractAddress.slice(0, 10)}...</span>
              {/if}
            </div>
          {:else}
            <div class="hint-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>Select the token you want to send. You can add ERC20 tokens by contract address.</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Custom submit slot for final step -->
      {#snippet submit()}
        {#if selectedNetwork && selectedToken}
          <div class="ready-indicator">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Ready
          </div>
        {/if}
      {/snippet}
    </StepNavigator>

  <!-- ============================================ -->
  <!-- STANDARD MODE: Conditional reveal with auto-flow -->
  <!-- ============================================ -->
  {:else if mode === 'standard'}
    <div class="standard-layout">
      <!-- Network Section - always visible -->
      <div class="section">
        <div class="section-header">
          <span class="section-label">
            <span class="step-badge">1</span>
            Network
          </span>
          <button type="button" class="add-btn" onclick={() => (showAddNetwork = true)} {disabled}>
            + Add
          </button>
        </div>

        <div class="network-grid compact">
          {#each networks as network, index}
            <div
              class="network-chip"
              class:selected={selectedNetwork?.chainId === network.chainId}
              class:disabled
              role="button"
              tabindex={disabled ? -1 : 0}
              onclick={() => !disabled && selectNetwork(network)}
              onkeydown={(e) => e.key === 'Enter' && !disabled && selectNetwork(network)}
            >
              <span class="network-name">{network.name}</span>
              <button
                type="button"
                class="edit-rpc-btn"
                onclick={(e) => { e.stopPropagation(); openEditRpcs(index); }}
                title="Edit RPC URLs"
                {disabled}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          {/each}
        </div>
      </div>

      <!-- Token Section - reveals when network selected -->
      {#if selectedNetwork}
        <div class="section reveal-section" class:revealed={!!selectedNetwork}>
          <div class="section-header">
            <span class="section-label">
              <span class="step-badge completed">✓</span>
              <span class="completed-text">{selectedNetwork.name}</span>
              <span class="arrow">→</span>
              <span class="step-badge">2</span>
              Token
            </span>
            <button type="button" class="add-btn" onclick={() => (showAddToken = true)} {disabled}>
              + Add
            </button>
          </div>

          <div class="token-grid compact">
            {#each availableTokens as token}
              <button
                type="button"
                class="token-chip"
                class:selected={selectedToken?.symbol === token.symbol &&
                  selectedToken?.contractAddress === token.contractAddress}
                onclick={() => selectToken(token)}
                {disabled}
              >
                <span class="token-symbol">{token.symbol}</span>
                <span class="token-type">{token.type === 'native' ? '◆' : '○'}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="pending-section">
          <span class="step-badge dim">2</span>
          <span class="pending-text">Select a network first to see available tokens</span>
        </div>
      {/if}

      <!-- Completion indicator -->
      {#if selectedNetwork && selectedToken}
        <div class="completion-bar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{selectedNetwork.name} / {selectedToken.symbol}</span>
        </div>
      {/if}
    </div>

  <!-- ============================================ -->
  <!-- EXPERT MODE: All fields visible, compact -->
  <!-- ============================================ -->
  {:else}
    <div class="expert-layout">
      <div class="expert-row">
        <!-- Network Dropdown -->
        <div class="expert-field">
          <div class="expert-label-row">
            <span class="expert-label">Network</span>
            <button type="button" class="mini-add-btn" onclick={() => (showAddNetwork = true)} {disabled}>+</button>
          </div>
          <select
            class="expert-select"
            value={selectedNetwork?.chainId?.toString() ?? ''}
            onchange={(e) => {
              const chainId = parseInt((e.target as HTMLSelectElement).value);
              const network = networks.find(n => n.chainId === chainId);
              if (network) selectNetwork(network);
            }}
            {disabled}
          >
            <option value="" disabled>Select network</option>
            {#each networks as network}
              <option value={network.chainId.toString()}>{network.name} ({network.nativeSymbol})</option>
            {/each}
          </select>
        </div>

        <!-- Token Dropdown -->
        <div class="expert-field">
          <div class="expert-label-row">
            <span class="expert-label">Token</span>
            {#if selectedNetwork}
              <button type="button" class="mini-add-btn" onclick={() => (showAddToken = true)} {disabled}>+</button>
            {/if}
          </div>
          <select
            class="expert-select"
            value={selectedToken ? `${selectedToken.symbol}-${selectedToken.contractAddress || 'native'}` : ''}
            onchange={(e) => {
              const val = (e.target as HTMLSelectElement).value;
              const [symbol, addr] = val.split('-');
              const token = availableTokens.find(t =>
                t.symbol === symbol && (t.contractAddress || 'native') === addr
              );
              if (token) selectToken(token);
            }}
            disabled={disabled || !selectedNetwork}
          >
            <option value="" disabled>{selectedNetwork ? 'Select token' : 'Select network first'}</option>
            {#each availableTokens as token}
              <option value={`${token.symbol}-${token.contractAddress || 'native'}`}>
                {token.symbol} ({token.type === 'native' ? 'Native' : 'ERC20'})
              </option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Quick summary -->
      {#if selectedNetwork && selectedToken}
        <div class="expert-summary">
          ✓ {selectedNetwork.name} / {selectedToken.symbol}
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Add Network Modal -->
{#if showAddNetwork}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <h3>Add Custom Network</h3>

      <div class="form-group">
        <span class="form-label">Chain ID *</span>
        <input
          type="number"
          bind:value={newNetwork.chainId}
          placeholder="e.g. 42161"
        />
      </div>

      <div class="form-group">
        <span class="form-label">Network Name *</span>
        <input
          type="text"
          bind:value={newNetwork.name}
          placeholder="e.g. Arbitrum"
        />
      </div>

      <div class="form-group">
        <div class="form-label-row">
          <span class="form-label">RPC URLs *</span>
          <button type="button" class="add-rpc-btn" onclick={addRpcInput}>+ Add</button>
        </div>
        {#each newNetwork.rpcUrls as rpcUrl, index}
          <div class="rpc-input-row">
            <input
              type="text"
              bind:value={newNetwork.rpcUrls[index]}
              placeholder="https://..."
            />
            {#if newNetwork.rpcUrls.length > 1}
              <button
                type="button"
                class="remove-btn"
                onclick={() => removeRpcInput(index)}
                aria-label="Remove RPC URL"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>

      <div class="form-group">
        <span class="form-label">Native Symbol *</span>
        <input
          type="text"
          bind:value={newNetwork.nativeSymbol}
          placeholder="e.g. ETH"
        />
      </div>

      <div class="form-group">
        <span class="form-label">Explorer URL</span>
        <input
          type="text"
          bind:value={newNetwork.explorerUrl}
          placeholder="https://..."
        />
      </div>

      {#if networkValidation.error}
        <div class="validation-error">{networkValidation.error}</div>
      {/if}

      <div class="modal-actions">
        <button type="button" class="btn-secondary" onclick={() => (showAddNetwork = false)}>
          Cancel
        </button>
        <button
          type="button"
          class="btn-primary"
          onclick={validateAndAddNetwork}
          disabled={networkValidation.isValidating}
        >
          {networkValidation.isValidating ? 'Validating...' : 'Add Network'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Edit RPCs Modal -->
{#if showEditRpcs && editingNetworkIndex !== null}
  {@const network = networks[editingNetworkIndex]}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <h3>Edit RPC URLs - {network.name}</h3>

      <div class="form-group">
        <div class="form-label-row">
          <span class="form-label">RPC URLs</span>
          <button type="button" class="add-rpc-btn" onclick={addEditingRpc}>+ Add</button>
        </div>
        {#each editingRpcs as rpcUrl, index}
          <div class="rpc-input-row">
            <input
              type="text"
              bind:value={editingRpcs[index]}
              placeholder="https://..."
            />
            {#if editingRpcs.length > 1}
              <button
                type="button"
                class="remove-btn"
                onclick={() => removeEditingRpc(index)}
                aria-label="Remove RPC URL"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>

      <div class="modal-actions">
        <button type="button" class="btn-secondary" onclick={() => (showEditRpcs = false)}>
          Cancel
        </button>
        <button type="button" class="btn-primary" onclick={saveRpcs}>
          Save
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Add Token Modal -->
{#if showAddToken && selectedNetwork}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <h3>Add Token - {selectedNetwork.name}</h3>

      <div class="form-group">
        <span class="form-label">Contract Address</span>
        <div class="input-with-button">
          <input
            type="text"
            bind:value={newTokenAddress}
            placeholder="0x..."
          />
          <button
            type="button"
            class="fetch-btn"
            onclick={fetchTokenMetadata}
            disabled={tokenValidation.isValidating}
          >
            {tokenValidation.isValidating ? 'Fetching...' : 'Fetch'}
          </button>
        </div>
        <p class="form-hint">Enter the token contract address. Metadata will be fetched automatically.</p>
      </div>

      {#if tokenValidation.error}
        <div class="validation-error">{tokenValidation.error}</div>
      {/if}

      {#if tokenValidation.fetchedToken}
        <div class="token-preview">
          <div class="token-preview-header">Token Found</div>
          <div class="token-preview-row">
            <span>Symbol:</span>
            <span class="token-preview-value">{tokenValidation.fetchedToken.symbol}</span>
          </div>
          <div class="token-preview-row">
            <span>Name:</span>
            <span class="token-preview-value">{tokenValidation.fetchedToken.name}</span>
          </div>
          <div class="token-preview-row">
            <span>Decimals:</span>
            <span class="token-preview-value">{tokenValidation.fetchedToken.decimals}</span>
          </div>
        </div>
      {/if}

      <div class="modal-actions">
        <button type="button" class="btn-secondary" onclick={closeAddTokenModal}>
          Cancel
        </button>
        <button
          type="button"
          class="btn-primary"
          onclick={addFetchedToken}
          disabled={!tokenValidation.fetchedToken}
        >
          Add Token
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .network-token-input {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .network-token-input.expert-mode {
    gap: 12px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary, #fff);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Step badge for standard mode */
  .step-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--accent, #0a84ff);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
  }

  .step-badge.completed {
    background: var(--success, #30d158);
  }

  .step-badge.dim {
    background: var(--bg-secondary, #333);
    color: var(--text-muted, rgba(255, 255, 255, 0.4));
  }

  .completed-text {
    color: var(--success, #30d158);
    font-weight: 500;
  }

  .arrow {
    color: var(--text-muted, rgba(255, 255, 255, 0.4));
    margin: 0 4px;
  }

  /* Standard mode layout */
  .standard-layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .reveal-section {
    animation: reveal 0.3s ease-out;
  }

  @keyframes reveal {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .pending-section {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    background: var(--bg-secondary, #141414);
    border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    opacity: 0.6;
  }

  .pending-text {
    font-size: 13px;
    color: var(--text-muted, rgba(255, 255, 255, 0.4));
  }

  .completion-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: rgba(48, 209, 88, 0.1);
    border: 1px solid var(--success, #30d158);
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--success, #30d158);
  }

  /* Compact grids for standard mode */
  .network-grid.compact,
  .token-grid.compact {
    gap: 6px;
  }

  .compact .network-chip,
  .compact .token-chip {
    padding: 8px 14px;
    min-width: 70px;
  }

  .compact .network-name,
  .compact .token-symbol {
    font-size: 12px;
  }

  .compact .network-symbol,
  .compact .token-type {
    font-size: 10px;
  }

  /* Expert mode layout */
  .expert-layout {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .expert-row {
    display: flex;
    gap: 12px;
  }

  .expert-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .expert-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .expert-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
  }

  .mini-add-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--accent, #0a84ff);
    border-radius: 4px;
    color: var(--accent, #0a84ff);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .mini-add-btn:hover {
    background: rgba(10, 132, 255, 0.1);
  }

  .expert-select {
    width: 100%;
    padding: 8px 12px;
    font-size: 13px;
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--text-primary, #fff);
    cursor: pointer;
    outline: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 30px;
  }

  .expert-select:focus {
    border-color: var(--accent, #0a84ff);
  }

  .expert-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .expert-select option {
    background: var(--bg-secondary, #1a1a1a);
    color: var(--text-primary, #fff);
    padding: 8px;
  }

  .expert-summary {
    font-size: 12px;
    color: var(--success, #30d158);
    font-weight: 500;
  }

  .add-btn {
    font-size: 12px;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--accent, #0a84ff);
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-btn:hover {
    background: rgba(10, 132, 255, 0.1);
    border-color: var(--accent, #0a84ff);
  }

  .network-grid,
  .token-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .network-chip,
  .token-chip {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 20px;
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 90px;
  }

  .network-chip:hover:not(.disabled),
  .token-chip:hover:not(:disabled) {
    border-color: var(--accent, #0a84ff);
    background: rgba(10, 132, 255, 0.05);
  }

  .network-chip.selected,
  .token-chip.selected {
    background: rgba(10, 132, 255, 0.15);
    border-color: var(--accent, #0a84ff);
  }

  .network-chip.disabled,
  .token-chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .network-name,
  .token-symbol {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary, #fff);
  }

  .network-symbol,
  .token-type {
    font-size: 11px;
    color: var(--text-muted, rgba(255, 255, 255, 0.4));
    margin-top: 2px;
  }

  .edit-rpc-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    padding: 4px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-muted, rgba(255, 255, 255, 0.4));
    cursor: pointer;
    opacity: 0;
    transition: all 0.15s;
  }

  .network-chip:hover .edit-rpc-btn {
    opacity: 1;
  }

  .edit-rpc-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--accent, #0a84ff);
  }


  .selection-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: rgba(48, 209, 88, 0.1);
    border: 1px solid var(--success, #30d158);
    border-radius: 8px;
    font-size: 13px;
    color: var(--success, #30d158);
  }

  .selection-summary strong {
    color: var(--text-primary, #fff);
  }

  .rpc-info,
  .contract-info {
    color: var(--text-muted, rgba(255, 255, 255, 0.4));
    font-size: 12px;
  }

  .hint-box {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 16px;
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
  }

  .hint-box svg {
    flex-shrink: 0;
    color: var(--accent, #0a84ff);
  }

  .ready-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--success, #30d158);
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-secondary, #1a1a1a);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    padding: 24px;
    min-width: 400px;
    max-width: 90vw;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .modal h3 {
    margin: 0 0 20px;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary, #fff);
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
    margin-bottom: 6px;
  }

  .form-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .form-label-row .form-label {
    margin-bottom: 0;
  }

  .add-rpc-btn {
    font-size: 11px;
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--accent, #0a84ff);
    border-radius: 4px;
    color: var(--accent, #0a84ff);
    cursor: pointer;
  }

  .add-rpc-btn:hover {
    background: rgba(10, 132, 255, 0.1);
  }

  .rpc-input-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .rpc-input-row input {
    flex: 1;
  }

  .remove-btn {
    padding: 8px;
    background: transparent;
    border: 1px solid var(--error, #ff453a);
    border-radius: 6px;
    color: var(--error, #ff453a);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-btn:hover {
    background: rgba(255, 69, 58, 0.1);
  }

  .form-group input {
    width: 100%;
    padding: 10px 14px;
    font-size: 14px;
    background: var(--bg-primary, #0a0a0a);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--text-primary, #fff);
    outline: none;
    transition: border-color 0.2s;
  }

  .form-group input:focus {
    border-color: var(--accent, #0a84ff);
  }

  .form-group input::placeholder {
    color: var(--text-muted, rgba(255, 255, 255, 0.3));
  }

  .form-hint {
    font-size: 12px;
    color: var(--text-muted, rgba(255, 255, 255, 0.4));
    margin-top: 6px;
  }

  .input-with-button {
    display: flex;
    gap: 8px;
  }

  .input-with-button input {
    flex: 1;
  }

  .fetch-btn {
    padding: 10px 16px;
    background: var(--accent, #0a84ff);
    border: none;
    border-radius: 8px;
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .fetch-btn:hover:not(:disabled) {
    background: var(--accent-hover, #409cff);
  }

  .fetch-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .validation-error {
    padding: 10px 14px;
    background: rgba(255, 69, 58, 0.1);
    border: 1px solid var(--error, #ff453a);
    border-radius: 8px;
    color: var(--error, #ff453a);
    font-size: 13px;
    margin-bottom: 16px;
  }

  .token-preview {
    padding: 16px;
    background: rgba(48, 209, 88, 0.1);
    border: 1px solid var(--success, #30d158);
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .token-preview-header {
    font-size: 12px;
    font-weight: 600;
    color: var(--success, #30d158);
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .token-preview-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    margin-bottom: 6px;
  }

  .token-preview-row:last-child {
    margin-bottom: 0;
  }

  .token-preview-row span:first-child {
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
  }

  .token-preview-value {
    color: var(--text-primary, #fff);
    font-weight: 500;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
  }

  .btn-primary,
  .btn-secondary {
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--accent, #0a84ff);
    border: none;
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover, #409cff);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    color: var(--text-primary, #fff);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.05);
  }
</style>
