<script lang="ts">
  import { t } from '$lib/i18n';
  import { goto } from '$app/navigation';
  import { fadeInUp } from '$lib/actions/fadeInUp';
  import { createInstance } from '$lib/updown-v2/store.svelte';
  import { routes } from '$lib/updown-v2/routes';
  import type { Strategy } from '$lib/updown-v2/types';

  // -- Basic Info --
  let name = $state('');
  let description = $state('');
  let tagsRaw = $state('');
  let riskLevel = $state<'conservative' | 'balanced' | 'aggressive'>('balanced');

  // -- Signal --
  type SignalMethod = 'clob_imbalance' | 'rsi_reversal' | 'volume_spike' | 'candle_pattern' | 'custom';
  let signalMethod = $state<SignalMethod>('clob_imbalance');

  // clob_imbalance params
  let clobThreshold = $state(0.6);
  let clobWindow = $state('5m');
  let clobDepthLevels = $state(5);

  // rsi_reversal params
  let rsiPeriod = $state(14);
  let rsiOverbought = $state(70);
  let rsiOversold = $state(30);

  // volume_spike params
  let volumeMultiplier = $state(2);
  let volumeLookback = $state(20);

  // candle_pattern params
  let candlePattern = $state('hammer');
  let candleConfirmBars = $state(1);

  // custom params
  let customJson = $state('{}');

  // -- Entry --
  let entryAmount = $state(5);
  let entryMethod = $state<'market' | 'limit'>('market');
  let entryMaxPrice = $state<string>('');
  let entryMinPrice = $state<string>('');
  let entryMaxPerHour = $state<string>('');

  // -- Risk --
  let dailyLossLimit = $state<string>('');
  let maxConsecutiveLosses = $state<string>('');
  let stopLossEnabled = $state(false);
  let stopLossType = $state<'trailing' | 'fixed'>('trailing');
  let stopLossPercent = $state(3);

  // -- Exit Rules --
  let exitRules = $state<{ type: 'take_profit' | 'stop_loss' | 'time_limit'; value: number }[]>([]);

  // -- Preview --
  let showPreview = $state(false);

  function getSignalParams(): Record<string, unknown> {
    switch (signalMethod) {
      case 'clob_imbalance':
        return { threshold: clobThreshold, window: clobWindow, depthLevels: clobDepthLevels };
      case 'rsi_reversal':
        return { period: rsiPeriod, overbought: rsiOverbought, oversold: rsiOversold };
      case 'volume_spike':
        return { multiplier: volumeMultiplier, lookback: volumeLookback };
      case 'candle_pattern':
        return { pattern: candlePattern, confirmBars: candleConfirmBars };
      case 'custom':
        try { return JSON.parse(customJson); }
        catch { return {}; }
    }
  }

  const strategy = $derived<Strategy>({
    $schema: 'BIP-323',
    id: name.trim() ? name.trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now() : 'untitled-' + Date.now(),
    name: name.trim() || 'Untitled',
    description: description.trim() || undefined,
    tags: tagsRaw.trim() ? tagsRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    riskLevel,
    signal: { method: signalMethod, params: getSignalParams() },
    entry: {
      amount: entryAmount,
      method: entryMethod,
      ...(entryMaxPrice ? { maxPrice: Number(entryMaxPrice) } : {}),
      ...(entryMinPrice ? { minPrice: Number(entryMinPrice) } : {}),
      ...(entryMaxPerHour ? { maxPerHour: Number(entryMaxPerHour) } : {})
    },
    ...(dailyLossLimit || maxConsecutiveLosses || stopLossEnabled ? {
      risk: {
        ...(dailyLossLimit ? { dailyLossLimit: Number(dailyLossLimit) } : {}),
        ...(maxConsecutiveLosses ? { maxConsecutiveLosses: Number(maxConsecutiveLosses) } : {}),
        ...(stopLossEnabled ? { stopLoss: { type: stopLossType, percent: stopLossPercent } } : {})
      }
    } : {}),
    ...(exitRules.length > 0 ? {
      exit: exitRules.map(r => {
        if (r.type === 'time_limit') return { type: r.type, minutes: r.value };
        return { type: r.type, percent: r.value };
      })
    } : {})
  });

  const previewJson = $derived(JSON.stringify(strategy, null, 2));

  function addExitRule() {
    exitRules.push({ type: 'take_profit', value: 5 });
  }

  function removeExitRule(index: number) {
    exitRules.splice(index, 1);
  }

  function handleCreateInstance() {
    const strategyId = strategy.id;
    const label = typeof strategy.name === 'string' ? strategy.name : strategy.name.en;
    const instanceId = createInstance({
      label,
      strategyId,
      spaceId: 'official',
      spaceName: 'Public Square',
      mode: 'sandbox'
    });
    goto(routes.instance('official', instanceId));
  }

  function handleSaveDraft() {
    alert(t('updown5m.editor.draftSaved'));
  }

  const signalMethods: { value: SignalMethod; label: string }[] = [
    { value: 'clob_imbalance', label: 'CLOB Imbalance' },
    { value: 'rsi_reversal', label: 'RSI Reversal' },
    { value: 'volume_spike', label: 'Volume Spike' },
    { value: 'candle_pattern', label: 'Candle Pattern' },
    { value: 'custom', label: 'Custom' }
  ];
</script>

<div class="editor-page">
  <!-- Header -->
  <section class="page-header" use:fadeInUp={{ delay: 0 }}>
    <a class="back-link" href={routes.hub()}>&larr; Back</a>
    <h1 class="page-title">{t('updown5m.editor.title')}</h1>
  </section>

  <!-- Basic Info -->
  <section class="glass-card" use:fadeInUp={{ delay: 50 }}>
    <h2 class="section-title">{t('updown5m.editor.basicInfo')}</h2>
    <div class="field">
      <label for="name">{t('updown5m.editor.name')}</label>
      <input id="name" type="text" bind:value={name} placeholder={t('updown5m.editor.namePlaceholder')} />
    </div>
    <div class="field">
      <label for="description">{t('updown5m.editor.description')}</label>
      <textarea id="description" bind:value={description} placeholder={t('updown5m.editor.descPlaceholder')} rows="3"></textarea>
    </div>
    <div class="field">
      <label for="tags">{t('updown5m.editor.tags')}</label>
      <input id="tags" type="text" bind:value={tagsRaw} placeholder={t('updown5m.editor.tagsPlaceholder')} />
    </div>
    <div class="field">
      <label for="riskLevel">{t('updown5m.editor.riskLevel')}</label>
      <select id="riskLevel" bind:value={riskLevel}>
        <option value="conservative">{t('updown5m.editor.conservative')}</option>
        <option value="balanced">{t('updown5m.editor.balanced')}</option>
        <option value="aggressive">{t('updown5m.editor.aggressive')}</option>
      </select>
    </div>
  </section>

  <!-- Signal -->
  <section class="glass-card" use:fadeInUp={{ delay: 100 }}>
    <h2 class="section-title">{t('updown5m.editor.signal')}</h2>
    <div class="field">
      <label for="signalMethod">{t('updown5m.editor.signalMethod')}</label>
      <select id="signalMethod" bind:value={signalMethod}>
        {#each signalMethods as m}
          <option value={m.value}>{m.label}</option>
        {/each}
      </select>
    </div>

    {#if signalMethod === 'clob_imbalance'}
      <div class="field-row">
        <div class="field">
          <label for="clobThreshold">{t('updown5m.editor.threshold')}</label>
          <input id="clobThreshold" type="number" bind:value={clobThreshold} min="0" max="1" step="0.05" />
        </div>
        <div class="field">
          <label for="clobWindow">{t('updown5m.editor.window')}</label>
          <select id="clobWindow" bind:value={clobWindow}>
            <option value="1m">1m</option>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
          </select>
        </div>
        <div class="field">
          <label for="clobDepth">{t('updown5m.editor.depthLevels')}</label>
          <input id="clobDepth" type="number" bind:value={clobDepthLevels} min="1" max="20" />
        </div>
      </div>
    {:else if signalMethod === 'rsi_reversal'}
      <div class="field-row">
        <div class="field">
          <label for="rsiPeriod">{t('updown5m.editor.period')}</label>
          <input id="rsiPeriod" type="number" bind:value={rsiPeriod} min="2" max="100" />
        </div>
        <div class="field">
          <label for="rsiOverbought">{t('updown5m.editor.overbought')}</label>
          <input id="rsiOverbought" type="number" bind:value={rsiOverbought} min="50" max="100" />
        </div>
        <div class="field">
          <label for="rsiOversold">{t('updown5m.editor.oversold')}</label>
          <input id="rsiOversold" type="number" bind:value={rsiOversold} min="0" max="50" />
        </div>
      </div>
    {:else if signalMethod === 'volume_spike'}
      <div class="field-row">
        <div class="field">
          <label for="volMultiplier">{t('updown5m.editor.multiplier')}</label>
          <input id="volMultiplier" type="number" bind:value={volumeMultiplier} min="1" step="0.5" />
        </div>
        <div class="field">
          <label for="volLookback">{t('updown5m.editor.lookback')}</label>
          <input id="volLookback" type="number" bind:value={volumeLookback} min="1" />
        </div>
      </div>
    {:else if signalMethod === 'candle_pattern'}
      <div class="field-row">
        <div class="field">
          <label for="candlePattern">{t('updown5m.editor.pattern')}</label>
          <select id="candlePattern" bind:value={candlePattern}>
            <option value="hammer">Hammer</option>
            <option value="doji">Doji</option>
            <option value="engulfing">Engulfing</option>
          </select>
        </div>
        <div class="field">
          <label for="candleConfirm">{t('updown5m.editor.confirmBars')}</label>
          <input id="candleConfirm" type="number" bind:value={candleConfirmBars} min="0" max="10" />
        </div>
      </div>
    {:else if signalMethod === 'custom'}
      <div class="field">
        <label for="customJson">{t('updown5m.editor.customJson')}</label>
        <textarea id="customJson" bind:value={customJson} rows="5" class="mono"></textarea>
      </div>
    {/if}
  </section>

  <!-- Entry -->
  <section class="glass-card" use:fadeInUp={{ delay: 150 }}>
    <h2 class="section-title">{t('updown5m.editor.entry')}</h2>
    <div class="field-row">
      <div class="field">
        <label for="entryAmount">{t('updown5m.editor.amount')}</label>
        <input id="entryAmount" type="number" bind:value={entryAmount} min="1" step="1" />
      </div>
      <div class="field">
        <label for="entryMethod">{t('updown5m.editor.entryMethod')}</label>
        <select id="entryMethod" bind:value={entryMethod}>
          <option value="market">Market</option>
          <option value="limit">Limit</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label for="maxPrice">{t('updown5m.editor.maxPrice')} <span class="optional">({t('updown5m.editor.optional')})</span></label>
        <input id="maxPrice" type="number" bind:value={entryMaxPrice} min="0" max="1" step="0.01" placeholder="0.65" />
      </div>
      <div class="field">
        <label for="minPrice">{t('updown5m.editor.minPrice')} <span class="optional">({t('updown5m.editor.optional')})</span></label>
        <input id="minPrice" type="number" bind:value={entryMinPrice} min="0" max="1" step="0.01" placeholder="0.35" />
      </div>
      <div class="field">
        <label for="maxPerHour">{t('updown5m.editor.maxPerHour')} <span class="optional">({t('updown5m.editor.optional')})</span></label>
        <input id="maxPerHour" type="number" bind:value={entryMaxPerHour} min="1" placeholder="8" />
      </div>
    </div>
  </section>

  <!-- Risk Management -->
  <section class="glass-card" use:fadeInUp={{ delay: 200 }}>
    <h2 class="section-title">{t('updown5m.editor.risk')}</h2>
    <div class="field-row">
      <div class="field">
        <label for="dailyLoss">{t('updown5m.editor.dailyLossLimit')} <span class="optional">({t('updown5m.editor.optional')})</span></label>
        <input id="dailyLoss" type="number" bind:value={dailyLossLimit} min="0" placeholder="50" />
      </div>
      <div class="field">
        <label for="maxLosses">{t('updown5m.editor.maxConsecutiveLosses')} <span class="optional">({t('updown5m.editor.optional')})</span></label>
        <input id="maxLosses" type="number" bind:value={maxConsecutiveLosses} min="0" placeholder="5" />
      </div>
    </div>
    <div class="field checkbox-field">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={stopLossEnabled} />
        <span>{t('updown5m.editor.stopLossEnabled')}</span>
      </label>
    </div>
    {#if stopLossEnabled}
      <div class="field-row">
        <div class="field">
          <label for="slType">{t('updown5m.editor.stopLossType')}</label>
          <select id="slType" bind:value={stopLossType}>
            <option value="trailing">{t('updown5m.editor.trailing')}</option>
            <option value="fixed">{t('updown5m.editor.fixed')}</option>
          </select>
        </div>
        <div class="field">
          <label for="slPercent">{t('updown5m.editor.stopLossPercent')}</label>
          <input id="slPercent" type="number" bind:value={stopLossPercent} min="0.1" step="0.5" />
        </div>
      </div>
    {/if}
  </section>

  <!-- Exit Rules -->
  <section class="glass-card" use:fadeInUp={{ delay: 250 }}>
    <h2 class="section-title">{t('updown5m.editor.exit')}</h2>
    {#each exitRules as rule, i}
      <div class="exit-rule">
        <div class="field-row">
          <div class="field">
            <label for="exitType-{i}">{t('updown5m.editor.exitType')}</label>
            <select id="exitType-{i}" bind:value={rule.type}>
              <option value="take_profit">{t('updown5m.editor.takeProfit')}</option>
              <option value="stop_loss">{t('updown5m.editor.stopLoss')}</option>
              <option value="time_limit">{t('updown5m.editor.timeLimit')}</option>
            </select>
          </div>
          <div class="field">
            <label for="exitVal-{i}">
              {rule.type === 'time_limit' ? t('updown5m.editor.minutes') : t('updown5m.editor.percent')}
            </label>
            <input id="exitVal-{i}" type="number" bind:value={rule.value} min="0" step="0.5" />
          </div>
          <button class="btn-remove" onclick={() => removeExitRule(i)}>{t('updown5m.editor.remove')}</button>
        </div>
      </div>
    {/each}
    <button class="btn-add" onclick={addExitRule}>{t('updown5m.editor.addRule')}</button>
  </section>

  <!-- Actions -->
  <section class="actions" use:fadeInUp={{ delay: 300 }}>
    <button class="btn-secondary" onclick={() => showPreview = !showPreview}>
      {t('updown5m.editor.previewJson')}
    </button>
    <button class="btn-secondary" onclick={handleSaveDraft}>
      {t('updown5m.editor.saveDraft')}
    </button>
    <button class="btn-primary" onclick={handleCreateInstance}>
      {t('updown5m.editor.createInstance')}
    </button>
  </section>

  <!-- JSON Preview -->
  {#if showPreview}
    <section class="glass-card preview-card" use:fadeInUp={{ delay: 0, duration: 300 }}>
      <h2 class="section-title">BIP-323 JSON</h2>
      <pre class="json-preview"><code>{previewJson}</code></pre>
    </section>
  {/if}
</div>

<style>
  .editor-page {
    max-width: 680px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .page-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .back-link {
    font-size: var(--text-sm);
    color: var(--fg-muted);
    text-decoration: none;
    transition: color var(--motion-fast) var(--easing);
  }

  .back-link:hover {
    color: var(--accent);
  }

  .page-title {
    font-size: var(--text-3xl);
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--fg-base);
    margin: 0;
  }

  .glass-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .section-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    color: var(--fg-base);
    margin: 0 0 var(--space-5) 0;
    letter-spacing: -0.01em;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }

  .field + .field {
    margin-top: var(--space-4);
  }

  .field-row {
    display: flex;
    gap: var(--space-4);
    align-items: flex-end;
  }

  .field-row .field + .field {
    margin-top: 0;
  }

  .field-row + .field-row,
  .field-row + .field,
  .field + .field-row {
    margin-top: var(--space-4);
  }

  label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--fg-muted);
  }

  .optional {
    font-weight: var(--weight-normal);
    color: var(--fg-subtle);
    font-size: var(--text-xs);
  }

  input[type='text'],
  input[type='number'],
  textarea,
  select {
    background: var(--bg-sunken);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-base);
    color: var(--fg-base);
    font-family: var(--font-sans);
    outline: none;
    transition: border-color var(--motion-fast) var(--easing),
                box-shadow var(--motion-fast) var(--easing);
    width: 100%;
    box-sizing: border-box;
  }

  input:focus,
  textarea:focus,
  select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-muted);
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--fg-faint);
  }

  textarea {
    resize: vertical;
  }

  textarea.mono {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  select {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--space-3) center;
    padding-right: var(--space-8);
  }

  .checkbox-field {
    margin-top: var(--space-4);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    font-size: var(--text-base);
    color: var(--fg-base);
  }

  .checkbox-label input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  /* Exit rules */
  .exit-rule {
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .exit-rule:last-of-type {
    border-bottom: none;
  }

  .btn-remove {
    background: none;
    border: 1px solid var(--error);
    color: var(--error);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    cursor: pointer;
    white-space: nowrap;
    align-self: flex-end;
    transition: background var(--motion-fast) var(--easing),
                color var(--motion-fast) var(--easing);
  }

  .btn-remove:hover {
    background: var(--error);
    color: var(--fg-inverse);
  }

  .btn-add {
    background: none;
    border: 1px dashed var(--border-base);
    color: var(--fg-muted);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    cursor: pointer;
    margin-top: var(--space-3);
    width: 100%;
    transition: border-color var(--motion-fast) var(--easing),
                color var(--motion-fast) var(--easing);
  }

  .btn-add:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* Actions */
  .actions {
    display: flex;
    gap: var(--space-3);
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .btn-primary,
  .btn-secondary {
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-5);
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition: transform var(--motion-fast) var(--easing),
                box-shadow var(--motion-fast) var(--easing),
                opacity var(--motion-fast) var(--easing);
  }

  .btn-primary {
    background: var(--accent);
    color: var(--accent-fg);
  }

  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border-base);
    color: var(--fg-muted);
  }

  .btn-secondary:hover {
    color: var(--fg-base);
    border-color: var(--border-strong);
  }

  /* JSON Preview */
  .preview-card {
    margin-top: 0;
  }

  .json-preview {
    background: var(--bg-sunken);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--fg-muted);
    line-height: var(--leading-relaxed);
    margin: 0;
    white-space: pre;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .editor-page {
      padding: var(--space-6) var(--space-4);
    }

    .page-title {
      font-size: var(--text-2xl);
    }

    .field-row {
      flex-direction: column;
      gap: 0;
    }

    .field-row .field + .field {
      margin-top: var(--space-4);
    }

    .btn-remove {
      align-self: flex-start;
      margin-top: var(--space-2);
    }

    .actions {
      flex-direction: column;
    }

    .actions .btn-primary,
    .actions .btn-secondary {
      width: 100%;
      text-align: center;
    }
  }
</style>
