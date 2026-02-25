<script lang="ts">
  /**
   * AirdropFormRenderer - Complex multi-section form renderer
   *
   * Demonstrates the value of three input modes:
   * - guided: Step-by-step wizard with explanations
   * - standard: Conditional reveal with section flow
   * - expert: All options visible with compact layout
   *
   * This is a comprehensive example showing how complex forms
   * become manageable with progressive disclosure.
   */
  import type { InputMode } from '@shelchin/pda-sveltekit';
  import { StepNavigator } from '@shelchin/pda-sveltekit';
  import NetworkTokenInput from './NetworkTokenInput.svelte';
  import type {
    TokenAirdropInput,
    DistributionMethod,
    RecipientInputMethod,
    GasPriority,
    SignatureType,
  } from '$lib/token-airdrop-app';
  import {
    BUILTIN_NETWORKS,
    BUILTIN_TOKENS,
    type NetworkConfig,
    type TokenConfig,
  } from '$lib/send-transaction-app';

  interface Props {
    value: TokenAirdropInput;
    onChange: (value: TokenAirdropInput) => void;
    disabled?: boolean;
    mode?: InputMode;
  }

  let { value, onChange, disabled = false, mode = 'standard' }: Props = $props();

  // Initialize with defaults if needed
  $effect(() => {
    if (!value) {
      const defaultNetwork = BUILTIN_NETWORKS[0];
      const defaultToken = BUILTIN_TOKENS[defaultNetwork.chainId]?.[0] || {
        type: 'native' as const,
        symbol: defaultNetwork.nativeSymbol,
        name: defaultNetwork.nativeSymbol,
        decimals: 18,
      };

      onChange({
        config: { network: defaultNetwork, token: defaultToken },
        distribution: {
          method: 'equal',
          totalAmount: '',
        },
        recipients: {
          inputMethod: 'manual',
          recipients: [],
        },
        gas: {
          priority: 'medium',
        },
        scheduling: {
          executeImmediately: true,
        },
        advanced: {
          batchSize: 100,
          retryFailedTx: true,
          maxRetries: 3,
          signatureType: 'eip-1559',
          useMultisig: false,
          verifyContracts: true,
          dryRun: false,
          notifyOnComplete: true,
        },
      });
    }
  });

  // Step definitions for guided mode
  const steps = [
    { id: 'network', title: 'Select Network & Token', description: 'Choose which token to distribute' },
    { id: 'distribution', title: 'Distribution Method', description: 'How to split tokens among recipients' },
    { id: 'recipients', title: 'Add Recipients', description: 'Enter or import recipient addresses' },
    { id: 'gas', title: 'Gas Settings', description: 'Configure transaction fees' },
    { id: 'scheduling', title: 'Scheduling', description: 'When to execute the airdrop' },
    { id: 'advanced', title: 'Advanced Options', description: 'Fine-tune batch settings and more' },
  ];

  let currentStep = $state(0);

  // Section validity checks
  let isNetworkValid = $derived(!!value?.config?.network && !!value?.config?.token);
  let isDistributionValid = $derived(!!value?.distribution?.method && !!value?.distribution?.totalAmount);
  let isRecipientsValid = $derived((value?.recipients?.recipients?.length ?? 0) > 0);
  let isGasValid = $derived(!!value?.gas?.priority);
  let isSchedulingValid = $derived(value?.scheduling?.executeImmediately || !!value?.scheduling?.scheduledTime);

  // Helper for step validation
  let canProceed = $derived.by(() => {
    switch (currentStep) {
      case 0: return isNetworkValid;
      case 1: return isDistributionValid;
      case 2: return isRecipientsValid;
      case 3: return isGasValid;
      case 4: return isSchedulingValid;
      case 5: return true;
      default: return false;
    }
  });

  // Update handlers
  function updateConfig(networkToken: { network: NetworkConfig; token: TokenConfig }) {
    onChange({ ...value!, config: networkToken });
  }

  function updateDistribution(key: string, val: unknown) {
    onChange({
      ...value!,
      distribution: { ...value!.distribution, [key]: val },
    });
  }

  function updateGas(key: string, val: unknown) {
    onChange({
      ...value!,
      gas: { ...value!.gas, [key]: val },
    });
  }

  function updateScheduling(key: string, val: unknown) {
    onChange({
      ...value!,
      scheduling: { ...value!.scheduling, [key]: val },
    });
  }

  function updateAdvanced(key: string, val: unknown) {
    onChange({
      ...value!,
      advanced: { ...value!.advanced, [key]: val },
    });
  }

  // Recipient management
  let manualAddress = $state('');
  let manualWeight = $state(1);
  let csvContent = $state('');

  function addRecipient() {
    if (!manualAddress.match(/^0x[a-fA-F0-9]{40}$/)) return;

    const newRecipient = {
      address: manualAddress,
      weight: value?.distribution?.method === 'weighted' ? manualWeight : undefined,
    };

    onChange({
      ...value!,
      recipients: {
        ...value!.recipients,
        recipients: [...(value!.recipients?.recipients || []), newRecipient],
      },
    });

    manualAddress = '';
    manualWeight = 1;
  }

  function removeRecipient(index: number) {
    const newRecipients = value!.recipients.recipients.filter((_, i) => i !== index);
    onChange({
      ...value!,
      recipients: { ...value!.recipients, recipients: newRecipients },
    });
  }

  function parseCSV() {
    const lines = csvContent.trim().split('\n').filter(Boolean);
    const recipients = lines.map((line) => {
      const parts = line.split(',').map((s) => s.trim());
      return {
        address: parts[0],
        weight: parts[1] ? parseFloat(parts[1]) : undefined,
        amount: parts[2] || undefined,
        label: parts[3] || undefined,
      };
    }).filter((r) => r.address.match(/^0x[a-fA-F0-9]{40}$/));

    onChange({
      ...value!,
      recipients: { ...value!.recipients, inputMethod: 'csv', recipients },
    });
  }

  // Section completeness for standard mode
  let sectionStates = $derived({
    network: isNetworkValid,
    distribution: isDistributionValid,
    recipients: isRecipientsValid,
    gas: isGasValid,
    scheduling: isSchedulingValid,
    advanced: true, // Always optional
  });
</script>

<div class="airdrop-form" class:expert-mode={mode === 'expert'}>
  <!-- ========================================== -->
  <!-- GUIDED MODE: Step-by-step wizard -->
  <!-- ========================================== -->
  {#if mode === 'guided'}
    <StepNavigator
      {steps}
      {currentStep}
      {canProceed}
      onStepChange={(i) => currentStep = i}
      {disabled}
    >
      {#if currentStep === 0}
        <!-- Network & Token -->
        <div class="guided-section">
          <NetworkTokenInput
            value={value?.config}
            onChange={updateConfig}
            {disabled}
            mode="guided"
          />
        </div>
      {:else if currentStep === 1}
        <!-- Distribution Method -->
        <div class="guided-section">
          <div class="method-selector">
            <h4>How should tokens be distributed?</h4>
            <div class="method-options">
              {#each ['equal', 'weighted', 'custom'] as method}
                <button
                  type="button"
                  class="method-card"
                  class:selected={value?.distribution?.method === method}
                  onclick={() => updateDistribution('method', method)}
                  {disabled}
                >
                  <span class="method-icon">
                    {method === 'equal' ? '⚖️' : method === 'weighted' ? '📊' : '✏️'}
                  </span>
                  <span class="method-name">
                    {method === 'equal' ? 'Equal' : method === 'weighted' ? 'Weighted' : 'Custom'}
                  </span>
                  <span class="method-desc">
                    {method === 'equal'
                      ? 'Same amount to everyone'
                      : method === 'weighted'
                        ? 'Proportional to weights'
                        : 'Specify each amount'}
                  </span>
                </button>
              {/each}
            </div>
          </div>

          <div class="form-field">
            <label>Total Amount to Distribute</label>
            <input
              type="text"
              value={value?.distribution?.totalAmount || ''}
              oninput={(e) => updateDistribution('totalAmount', (e.target as HTMLInputElement).value)}
              placeholder="e.g. 1000"
              {disabled}
            />
            <span class="field-hint">
              Total {value?.config?.token?.symbol || 'tokens'} to distribute
            </span>
          </div>
        </div>
      {:else if currentStep === 2}
        <!-- Recipients -->
        <div class="guided-section">
          <div class="input-method-tabs">
            {#each [['manual', '✍️ Manual'], ['csv', '📄 CSV'], ['ens', '🔗 ENS']] as [method, label]}
              <button
                type="button"
                class="tab-btn"
                class:active={value?.recipients?.inputMethod === method}
                onclick={() => onChange({ ...value!, recipients: { ...value!.recipients, inputMethod: method as RecipientInputMethod } })}
                {disabled}
              >
                {label}
              </button>
            {/each}
          </div>

          {#if value?.recipients?.inputMethod === 'manual'}
            <div class="manual-input">
              <div class="add-recipient-row">
                <input
                  type="text"
                  bind:value={manualAddress}
                  placeholder="0x..."
                  class="address-input"
                />
                {#if value?.distribution?.method === 'weighted'}
                  <input
                    type="number"
                    bind:value={manualWeight}
                    placeholder="Weight"
                    class="weight-input"
                    min="0"
                  />
                {/if}
                <button type="button" class="add-btn" onclick={addRecipient} {disabled}>
                  Add
                </button>
              </div>
            </div>
          {:else if value?.recipients?.inputMethod === 'csv'}
            <div class="csv-input">
              <textarea
                bind:value={csvContent}
                placeholder="address,weight (optional)
0x123...,10
0x456...,20"
                rows="6"
              ></textarea>
              <button type="button" class="parse-btn" onclick={parseCSV} {disabled}>
                Parse CSV
              </button>
            </div>
          {:else}
            <div class="ens-input">
              <p class="ens-hint">Enter ENS names (one per line)</p>
              <textarea placeholder="vitalik.eth
uniswap.eth" rows="4"></textarea>
              <button type="button" class="resolve-btn" {disabled}>
                Resolve Names
              </button>
            </div>
          {/if}

          <!-- Recipient list -->
          {#if (value?.recipients?.recipients?.length ?? 0) > 0}
            <div class="recipient-list">
              <h4>{value!.recipients.recipients.length} Recipients</h4>
              <div class="recipient-scroll">
                {#each value!.recipients.recipients.slice(0, 5) as recipient, i}
                  <div class="recipient-row">
                    <span class="recipient-addr">{recipient.address.slice(0, 10)}...{recipient.address.slice(-6)}</span>
                    {#if recipient.weight}
                      <span class="recipient-weight">×{recipient.weight}</span>
                    {/if}
                    <button type="button" class="remove-btn" onclick={() => removeRecipient(i)}>×</button>
                  </div>
                {/each}
                {#if value!.recipients.recipients.length > 5}
                  <div class="more-count">+{value!.recipients.recipients.length - 5} more</div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {:else if currentStep === 3}
        <!-- Gas Settings -->
        <div class="guided-section">
          <h4>Transaction Priority</h4>
          <div class="priority-options">
            {#each [['low', '🐢', 'Low', 'Slower but cheaper'], ['medium', '🚗', 'Medium', 'Balanced'], ['high', '🚀', 'High', 'Fast but expensive'], ['custom', '⚙️', 'Custom', 'Set your own']] as [priority, icon, name, desc]}
              <button
                type="button"
                class="priority-card"
                class:selected={value?.gas?.priority === priority}
                onclick={() => updateGas('priority', priority)}
                {disabled}
              >
                <span class="priority-icon">{icon}</span>
                <span class="priority-name">{name}</span>
                <span class="priority-desc">{desc}</span>
              </button>
            {/each}
          </div>

          {#if value?.gas?.priority === 'custom'}
            <div class="custom-gas-fields">
              <div class="form-field">
                <label>Max Fee (Gwei)</label>
                <input
                  type="number"
                  value={value?.gas?.maxFeeGwei || ''}
                  oninput={(e) => updateGas('maxFeeGwei', parseFloat((e.target as HTMLInputElement).value))}
                  placeholder="e.g. 50"
                />
              </div>
              <div class="form-field">
                <label>Max Priority Fee (Gwei)</label>
                <input
                  type="number"
                  value={value?.gas?.maxPriorityFeeGwei || ''}
                  oninput={(e) => updateGas('maxPriorityFeeGwei', parseFloat((e.target as HTMLInputElement).value))}
                  placeholder="e.g. 2"
                />
              </div>
            </div>
          {/if}
        </div>
      {:else if currentStep === 4}
        <!-- Scheduling -->
        <div class="guided-section">
          <h4>When to Execute</h4>
          <div class="schedule-options">
            <label class="radio-option">
              <input
                type="radio"
                checked={value?.scheduling?.executeImmediately}
                onchange={() => updateScheduling('executeImmediately', true)}
                {disabled}
              />
              <span class="radio-label">Execute immediately</span>
            </label>
            <label class="radio-option">
              <input
                type="radio"
                checked={!value?.scheduling?.executeImmediately}
                onchange={() => updateScheduling('executeImmediately', false)}
                {disabled}
              />
              <span class="radio-label">Schedule for later</span>
            </label>
          </div>

          {#if !value?.scheduling?.executeImmediately}
            <div class="schedule-datetime">
              <div class="form-field">
                <label>Date & Time</label>
                <input
                  type="datetime-local"
                  value={value?.scheduling?.scheduledTime || ''}
                  oninput={(e) => updateScheduling('scheduledTime', (e.target as HTMLInputElement).value)}
                  {disabled}
                />
              </div>
            </div>
          {/if}
        </div>
      {:else if currentStep === 5}
        <!-- Advanced Options -->
        <div class="guided-section">
          <h4>Advanced Settings</h4>
          <p class="section-hint">These settings are optional but give you more control.</p>

          <div class="advanced-grid">
            <div class="form-field">
              <label>Batch Size</label>
              <input
                type="number"
                value={value?.advanced?.batchSize}
                oninput={(e) => updateAdvanced('batchSize', parseInt((e.target as HTMLInputElement).value))}
                min="1"
                max="500"
                {disabled}
              />
              <span class="field-hint">Recipients per batch (1-500)</span>
            </div>

            <div class="form-field">
              <label>Max Retries</label>
              <input
                type="number"
                value={value?.advanced?.maxRetries}
                oninput={(e) => updateAdvanced('maxRetries', parseInt((e.target as HTMLInputElement).value))}
                min="0"
                max="10"
                {disabled}
              />
              <span class="field-hint">Retry failed transactions</span>
            </div>
          </div>

          <div class="toggle-options">
            <label class="toggle-option">
              <input
                type="checkbox"
                checked={value?.advanced?.dryRun}
                onchange={(e) => updateAdvanced('dryRun', (e.target as HTMLInputElement).checked)}
                {disabled}
              />
              <span>🧪 Dry Run (simulate without sending)</span>
            </label>

            <label class="toggle-option">
              <input
                type="checkbox"
                checked={value?.advanced?.verifyContracts}
                onchange={(e) => updateAdvanced('verifyContracts', (e.target as HTMLInputElement).checked)}
                {disabled}
              />
              <span>✅ Verify contracts before sending</span>
            </label>

            <label class="toggle-option">
              <input
                type="checkbox"
                checked={value?.advanced?.notifyOnComplete}
                onchange={(e) => updateAdvanced('notifyOnComplete', (e.target as HTMLInputElement).checked)}
                {disabled}
              />
              <span>📧 Email notification on complete</span>
            </label>
          </div>

          {#if value?.advanced?.notifyOnComplete}
            <div class="form-field">
              <label>Notification Email</label>
              <input
                type="email"
                value={value?.advanced?.notificationEmail || ''}
                oninput={(e) => updateAdvanced('notificationEmail', (e.target as HTMLInputElement).value)}
                placeholder="you@example.com"
                {disabled}
              />
            </div>
          {/if}
        </div>
      {/if}

      {#snippet submit()}
        {#if currentStep === 5 && isNetworkValid && isDistributionValid && isRecipientsValid}
          <div class="ready-badge">
            ✓ Ready to Execute
          </div>
        {/if}
      {/snippet}
    </StepNavigator>

  <!-- ========================================== -->
  <!-- STANDARD MODE: Conditional reveal -->
  <!-- ========================================== -->
  {:else if mode === 'standard'}
    <div class="standard-layout">
      <!-- Section 1: Network & Token -->
      <div class="std-section" class:completed={sectionStates.network}>
        <div class="std-section-header">
          <span class="section-badge" class:done={sectionStates.network}>
            {sectionStates.network ? '✓' : '1'}
          </span>
          <span class="section-title">Network & Token</span>
        </div>
        <div class="std-section-content">
          <NetworkTokenInput
            value={value?.config}
            onChange={updateConfig}
            {disabled}
            mode="standard"
          />
        </div>
      </div>

      <!-- Section 2: Distribution (reveals when network selected) -->
      {#if sectionStates.network}
        <div class="std-section reveal" class:completed={sectionStates.distribution}>
          <div class="std-section-header">
            <span class="section-badge" class:done={sectionStates.distribution}>
              {sectionStates.distribution ? '✓' : '2'}
            </span>
            <span class="section-title">Distribution</span>
          </div>
          <div class="std-section-content">
            <div class="compact-method-row">
              {#each ['equal', 'weighted', 'custom'] as method}
                <button
                  type="button"
                  class="compact-method-btn"
                  class:selected={value?.distribution?.method === method}
                  onclick={() => updateDistribution('method', method)}
                  {disabled}
                >
                  {method === 'equal' ? '⚖️ Equal' : method === 'weighted' ? '📊 Weighted' : '✏️ Custom'}
                </button>
              {/each}
            </div>
            <input
              type="text"
              class="amount-input"
              value={value?.distribution?.totalAmount || ''}
              oninput={(e) => updateDistribution('totalAmount', (e.target as HTMLInputElement).value)}
              placeholder={`Total ${value?.config?.token?.symbol || 'amount'}`}
              {disabled}
            />
          </div>
        </div>
      {/if}

      <!-- Section 3: Recipients (reveals when distribution set) -->
      {#if sectionStates.distribution}
        <div class="std-section reveal" class:completed={sectionStates.recipients}>
          <div class="std-section-header">
            <span class="section-badge" class:done={sectionStates.recipients}>
              {sectionStates.recipients ? '✓' : '3'}
            </span>
            <span class="section-title">Recipients</span>
            <span class="recipient-count">
              {value?.recipients?.recipients?.length || 0} added
            </span>
          </div>
          <div class="std-section-content">
            <div class="quick-add-row">
              <input
                type="text"
                bind:value={manualAddress}
                placeholder="0x... address"
                class="quick-address"
              />
              <button type="button" class="quick-add-btn" onclick={addRecipient} {disabled}>+</button>
            </div>
            {#if (value?.recipients?.recipients?.length ?? 0) > 0}
              <div class="mini-recipient-list">
                {#each value!.recipients.recipients.slice(0, 3) as r, i}
                  <span class="mini-recipient">
                    {r.address.slice(0, 6)}...
                    <button type="button" onclick={() => removeRecipient(i)}>×</button>
                  </span>
                {/each}
                {#if value!.recipients.recipients.length > 3}
                  <span class="more-badge">+{value!.recipients.recipients.length - 3}</span>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Section 4 & 5: Gas & Scheduling (collapsed by default) -->
      {#if sectionStates.recipients}
        <div class="std-section-row reveal">
          <div class="std-section mini">
            <span class="mini-label">Gas:</span>
            <select
              value={value?.gas?.priority}
              onchange={(e) => updateGas('priority', (e.target as HTMLSelectElement).value)}
              {disabled}
            >
              <option value="low">🐢 Low</option>
              <option value="medium">🚗 Medium</option>
              <option value="high">🚀 High</option>
            </select>
          </div>
          <div class="std-section mini">
            <span class="mini-label">Execute:</span>
            <select
              value={value?.scheduling?.executeImmediately ? 'now' : 'later'}
              onchange={(e) => updateScheduling('executeImmediately', (e.target as HTMLSelectElement).value === 'now')}
              {disabled}
            >
              <option value="now">Now</option>
              <option value="later">Schedule</option>
            </select>
          </div>
        </div>

        <!-- Expandable advanced section -->
        <details class="advanced-details">
          <summary>Advanced Options</summary>
          <div class="advanced-content">
            <label class="inline-option">
              <input type="checkbox" checked={value?.advanced?.dryRun} onchange={(e) => updateAdvanced('dryRun', (e.target as HTMLInputElement).checked)} />
              Dry run
            </label>
            <label class="inline-option">
              <input type="checkbox" checked={value?.advanced?.verifyContracts} onchange={(e) => updateAdvanced('verifyContracts', (e.target as HTMLInputElement).checked)} />
              Verify contracts
            </label>
            <div class="inline-field">
              <span>Batch:</span>
              <input type="number" value={value?.advanced?.batchSize} oninput={(e) => updateAdvanced('batchSize', parseInt((e.target as HTMLInputElement).value))} min="1" max="500" />
            </div>
          </div>
        </details>
      {/if}

      <!-- Completion summary -->
      {#if sectionStates.network && sectionStates.distribution && sectionStates.recipients}
        <div class="completion-summary">
          <span class="check">✓</span>
          Airdrop {value?.distribution?.totalAmount} {value?.config?.token?.symbol} to {value?.recipients?.recipients?.length} recipients
        </div>
      {/if}
    </div>

  <!-- ========================================== -->
  <!-- EXPERT MODE: Everything visible, compact -->
  <!-- ========================================== -->
  {:else}
    <div class="expert-layout">
      <!-- Row 1: Network + Token + Distribution -->
      <div class="expert-row">
        <div class="expert-field flex-2">
          <span class="expert-label">Network / Token</span>
          <NetworkTokenInput
            value={value?.config}
            onChange={updateConfig}
            {disabled}
            mode="expert"
          />
        </div>
        <div class="expert-field">
          <span class="expert-label">Method</span>
          <select
            class="expert-select"
            value={value?.distribution?.method}
            onchange={(e) => updateDistribution('method', (e.target as HTMLSelectElement).value)}
            {disabled}
          >
            <option value="equal">Equal</option>
            <option value="weighted">Weighted</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div class="expert-field">
          <span class="expert-label">Total</span>
          <input
            type="text"
            class="expert-input"
            value={value?.distribution?.totalAmount || ''}
            oninput={(e) => updateDistribution('totalAmount', (e.target as HTMLInputElement).value)}
            placeholder="Amount"
            {disabled}
          />
        </div>
      </div>

      <!-- Row 2: Recipients -->
      <div class="expert-row">
        <div class="expert-field flex-3">
          <span class="expert-label">Recipients ({value?.recipients?.recipients?.length || 0})</span>
          <div class="expert-recipient-row">
            <input
              type="text"
              class="expert-input"
              bind:value={manualAddress}
              placeholder="0x..."
            />
            <button type="button" class="expert-add" onclick={addRecipient}>+</button>
            {#each value?.recipients?.recipients?.slice(0, 2) || [] as r, i}
              <span class="expert-chip">
                {r.address.slice(0, 6)}...
                <button onclick={() => removeRecipient(i)}>×</button>
              </span>
            {/each}
            {#if (value?.recipients?.recipients?.length || 0) > 2}
              <span class="expert-more">+{(value?.recipients?.recipients?.length || 0) - 2}</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Row 3: Gas + Schedule + Options -->
      <div class="expert-row">
        <div class="expert-field">
          <span class="expert-label">Gas</span>
          <select class="expert-select" value={value?.gas?.priority} onchange={(e) => updateGas('priority', (e.target as HTMLSelectElement).value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div class="expert-field">
          <span class="expert-label">Execute</span>
          <select class="expert-select" value={value?.scheduling?.executeImmediately ? 'now' : 'later'} onchange={(e) => updateScheduling('executeImmediately', (e.target as HTMLSelectElement).value === 'now')}>
            <option value="now">Now</option>
            <option value="later">Schedule</option>
          </select>
        </div>
        <div class="expert-field">
          <span class="expert-label">Batch</span>
          <input type="number" class="expert-input" value={value?.advanced?.batchSize} oninput={(e) => updateAdvanced('batchSize', parseInt((e.target as HTMLInputElement).value))} min="1" max="500" />
        </div>
        <div class="expert-field">
          <span class="expert-label">Options</span>
          <div class="expert-toggles">
            <label title="Dry Run"><input type="checkbox" checked={value?.advanced?.dryRun} onchange={(e) => updateAdvanced('dryRun', (e.target as HTMLInputElement).checked)} /> 🧪</label>
            <label title="Verify"><input type="checkbox" checked={value?.advanced?.verifyContracts} onchange={(e) => updateAdvanced('verifyContracts', (e.target as HTMLInputElement).checked)} /> ✅</label>
            <label title="Notify"><input type="checkbox" checked={value?.advanced?.notifyOnComplete} onchange={(e) => updateAdvanced('notifyOnComplete', (e.target as HTMLInputElement).checked)} /> 📧</label>
          </div>
        </div>
      </div>

      <!-- Summary -->
      {#if isNetworkValid && isDistributionValid && isRecipientsValid}
        <div class="expert-summary">
          ✓ {value?.distribution?.totalAmount} {value?.config?.token?.symbol} → {value?.recipients?.recipients?.length} recipients ({value?.distribution?.method})
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .airdrop-form {
    font-size: 14px;
  }

  /* ========== GUIDED MODE STYLES ========== */
  .guided-section {
    padding: 8px 0;
  }

  .method-selector h4,
  .guided-section h4 {
    margin: 0 0 16px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary, #fff);
  }

  .method-options,
  .priority-options {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .method-card,
  .priority-card {
    flex: 1;
    min-width: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .method-card:hover,
  .priority-card:hover {
    border-color: var(--accent, #0a84ff);
  }

  .method-card.selected,
  .priority-card.selected {
    background: rgba(10, 132, 255, 0.15);
    border-color: var(--accent, #0a84ff);
  }

  .method-icon,
  .priority-icon {
    font-size: 24px;
  }

  .method-name,
  .priority-name {
    font-weight: 600;
    color: var(--text-primary, #fff);
  }

  .method-desc,
  .priority-desc {
    font-size: 12px;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
    text-align: center;
  }

  .form-field {
    margin-top: 16px;
  }

  .form-field label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
    margin-bottom: 6px;
  }

  .form-field input,
  .form-field textarea,
  .form-field select {
    width: 100%;
    padding: 10px 14px;
    font-size: 14px;
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--text-primary, #fff);
    outline: none;
  }

  .form-field input:focus,
  .form-field textarea:focus {
    border-color: var(--accent, #0a84ff);
  }

  .field-hint {
    display: block;
    font-size: 12px;
    color: var(--text-muted, rgba(255, 255, 255, 0.4));
    margin-top: 4px;
  }

  .section-hint {
    font-size: 13px;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
    margin-bottom: 16px;
  }

  /* Input method tabs */
  .input-method-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .tab-btn {
    padding: 8px 16px;
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    font-size: 13px;
  }

  .tab-btn.active {
    background: rgba(10, 132, 255, 0.15);
    border-color: var(--accent, #0a84ff);
    color: var(--accent, #0a84ff);
  }

  .add-recipient-row {
    display: flex;
    gap: 8px;
  }

  .address-input {
    flex: 1;
    padding: 10px 14px;
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--text-primary, #fff);
    font-size: 14px;
    font-family: monospace;
  }

  .weight-input {
    width: 80px;
    padding: 10px;
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--text-primary, #fff);
  }

  .add-btn,
  .parse-btn,
  .resolve-btn {
    padding: 10px 20px;
    background: var(--accent, #0a84ff);
    border: none;
    border-radius: 8px;
    color: #fff;
    font-weight: 500;
    cursor: pointer;
  }

  .csv-input textarea,
  .ens-input textarea {
    font-family: monospace;
    font-size: 13px;
  }

  .ens-hint {
    font-size: 13px;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
    margin-bottom: 8px;
  }

  .recipient-list {
    margin-top: 16px;
    padding: 12px;
    background: var(--bg-secondary, #141414);
    border-radius: 8px;
  }

  .recipient-list h4 {
    margin: 0 0 12px;
    font-size: 13px;
  }

  .recipient-scroll {
    max-height: 150px;
    overflow-y: auto;
  }

  .recipient-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.05));
  }

  .recipient-addr {
    font-family: monospace;
    font-size: 12px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.7));
  }

  .recipient-weight {
    font-size: 11px;
    color: var(--accent, #0a84ff);
    background: rgba(10, 132, 255, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .remove-btn {
    margin-left: auto;
    padding: 2px 6px;
    background: transparent;
    border: 1px solid var(--error, #ff453a);
    border-radius: 4px;
    color: var(--error, #ff453a);
    cursor: pointer;
    font-size: 12px;
  }

  .more-count {
    font-size: 12px;
    color: var(--text-muted, rgba(255, 255, 255, 0.4));
    padding: 8px 0;
  }

  .custom-gas-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 16px;
  }

  .schedule-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .radio-label {
    font-size: 14px;
    color: var(--text-primary, #fff);
  }

  .schedule-datetime {
    margin-top: 16px;
  }

  .advanced-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .toggle-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 16px;
  }

  .toggle-option {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    color: var(--text-primary, #fff);
  }

  .ready-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--success, #30d158);
  }

  /* ========== STANDARD MODE STYLES ========== */
  .standard-layout {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .std-section {
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    padding: 14px;
  }

  .std-section.reveal {
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .std-section.completed {
    border-color: rgba(48, 209, 88, 0.3);
  }

  .std-section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .section-badge {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent, #0a84ff);
    border-radius: 50%;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
  }

  .section-badge.done {
    background: var(--success, #30d158);
  }

  .section-title {
    font-weight: 600;
    color: var(--text-primary, #fff);
  }

  .recipient-count {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
  }

  .compact-method-row {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  .compact-method-btn {
    flex: 1;
    padding: 8px;
    background: transparent;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
    font-size: 12px;
    cursor: pointer;
  }

  .compact-method-btn.selected {
    background: rgba(10, 132, 255, 0.15);
    border-color: var(--accent, #0a84ff);
    color: var(--accent, #0a84ff);
  }

  .amount-input {
    width: 100%;
    padding: 10px;
    background: var(--bg-primary, #0a0a0a);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--text-primary, #fff);
  }

  .quick-add-row {
    display: flex;
    gap: 8px;
  }

  .quick-address {
    flex: 1;
    padding: 8px 12px;
    background: var(--bg-primary, #0a0a0a);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--text-primary, #fff);
    font-family: monospace;
    font-size: 13px;
  }

  .quick-add-btn {
    padding: 8px 14px;
    background: var(--accent, #0a84ff);
    border: none;
    border-radius: 6px;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }

  .mini-recipient-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }

  .mini-recipient {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    font-family: monospace;
    font-size: 11px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.7));
  }

  .mini-recipient button {
    padding: 0 2px;
    background: none;
    border: none;
    color: var(--error, #ff453a);
    cursor: pointer;
    font-size: 12px;
  }

  .more-badge {
    padding: 4px 8px;
    background: rgba(10, 132, 255, 0.1);
    border-radius: 4px;
    font-size: 11px;
    color: var(--accent, #0a84ff);
  }

  .std-section-row {
    display: flex;
    gap: 10px;
  }

  .std-section.mini {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
  }

  .mini-label {
    font-size: 12px;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
  }

  .std-section.mini select {
    flex: 1;
    padding: 6px 10px;
    background: var(--bg-primary, #0a0a0a);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--text-primary, #fff);
    font-size: 12px;
  }

  .advanced-details {
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    padding: 10px 12px;
  }

  .advanced-details summary {
    font-size: 12px;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    user-select: none;
  }

  .advanced-content {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 10px;
  }

  .inline-option {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.7));
    cursor: pointer;
  }

  .inline-field {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
  }

  .inline-field input {
    width: 60px;
    padding: 4px 8px;
    background: var(--bg-primary, #0a0a0a);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
    color: var(--text-primary, #fff);
    font-size: 12px;
  }

  .completion-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: rgba(48, 209, 88, 0.1);
    border: 1px solid var(--success, #30d158);
    border-radius: 8px;
    font-size: 13px;
    color: var(--success, #30d158);
  }

  .completion-summary .check {
    font-weight: bold;
  }

  /* ========== EXPERT MODE STYLES ========== */
  .expert-layout {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .expert-row {
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }

  .expert-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .expert-field.flex-2 { flex: 2; }
  .expert-field.flex-3 { flex: 3; }

  .expert-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
  }

  .expert-select,
  .expert-input {
    padding: 8px 10px;
    font-size: 12px;
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--text-primary, #fff);
  }

  .expert-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 24px;
  }

  .expert-recipient-row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .expert-recipient-row .expert-input {
    flex: 1;
    min-width: 150px;
    font-family: monospace;
  }

  .expert-add {
    padding: 8px 12px;
    background: var(--accent, #0a84ff);
    border: none;
    border-radius: 6px;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }

  .expert-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    font-family: monospace;
    font-size: 11px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.7));
  }

  .expert-chip button {
    padding: 0;
    background: none;
    border: none;
    color: var(--error, #ff453a);
    cursor: pointer;
  }

  .expert-more {
    font-size: 11px;
    color: var(--accent, #0a84ff);
  }

  .expert-toggles {
    display: flex;
    gap: 10px;
  }

  .expert-toggles label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    cursor: pointer;
  }

  .expert-summary {
    padding: 8px 12px;
    background: rgba(48, 209, 88, 0.1);
    border-radius: 6px;
    font-size: 12px;
    color: var(--success, #30d158);
  }
</style>
