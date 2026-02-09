<script lang="ts">
  import { t, preferences, formatNumber, formatCurrency, formatDate } from '$lib/i18n';
  import {
    initProductionDevTools,
    enableProductionDevTools,
    disableProductionDevTools,
    isProductionDevToolsEnabled,
  } from '$lib/i18n';
  import { browser, dev } from '$app/environment';

  // 预览数据
  const previewNumber = 1234567.89;

  // 使用 $derived 使预览值响应偏好设置变化
  const formattedNumber = $derived(formatNumber(previewNumber));
  const formattedCurrency = $derived(formatCurrency(previewNumber));
  const formattedDate = $derived(formatDate(new Date(), { dateStyle: 'full', timeStyle: 'long' }));
  const prefsJson = $derived(JSON.stringify(preferences.value, null, 2));

  // 生产模式 DevTools 状态
  let devToolsEnabled = $state(false);
  let devToolsInitialized = $state(false);
  let devToolsLoading = $state(false);

  // 初始化时检查状态
  $effect(() => {
    if (browser && !dev) {
      devToolsEnabled = isProductionDevToolsEnabled();
    }
  });

  // 切换生产模式 DevTools
  async function toggleDevTools() {
    if (devToolsLoading) return;

    if (!devToolsEnabled) {
      devToolsLoading = true;
      try {
        // 首次启用需要初始化
        if (!devToolsInitialized) {
          const success = await initProductionDevTools();
          if (!success) {
            devToolsLoading = false;
            return;
          }
          devToolsInitialized = true;
        }
        enableProductionDevTools();
        devToolsEnabled = true;
      } finally {
        devToolsLoading = false;
      }
    } else {
      disableProductionDevTools();
      devToolsEnabled = false;
    }
  }

  // 偏好持久化
  const STORAGE_KEY = 'i18n-preferences';

  // 恢复偏好
  $effect(() => {
    if (browser) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // 不恢复 locale，因为它由 URL 控制
          const { locale: _, ...rest } = parsed;
          Object.assign(preferences.value, rest);
        } catch {
          // ignore
        }
      }
    }
  });

  // 保存偏好 (debounced)
  let saveTimeout: ReturnType<typeof setTimeout>;
  $effect(() => {
    if (browser) {
      // 读取当前值触发响应式
      const current = preferences.value;
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      }, 500);
    }
  });

  // 可选项 - 使用 i18n
  const localeOptions = [
    { value: 'zh', labelKey: 'options.locale.zh' },
    { value: 'en', labelKey: 'options.locale.en' },
    { value: 'de', labelKey: 'options.locale.de' },
    { value: 'es', labelKey: 'options.locale.es' },
    { value: 'ja', labelKey: 'options.locale.ja' },
    { value: 'pt', labelKey: 'options.locale.pt' },
  ];

  const numberLocaleOptions = [
    { value: 'zh-CN', labelKey: 'options.numberLocale.zhCN' },
    { value: 'en-US', labelKey: 'options.numberLocale.enUS' },
    { value: 'de-DE', labelKey: 'options.numberLocale.deDE' },
    { value: 'es-ES', labelKey: 'options.numberLocale.esES' },
    { value: 'ja-JP', labelKey: 'options.numberLocale.jaJP' },
    { value: 'pt-BR', labelKey: 'options.numberLocale.ptBR' },
    { value: 'fr-FR', labelKey: 'options.numberLocale.frFR' },
  ];

  const dateLocaleOptions = [
    { value: 'zh-CN', labelKey: 'options.dateLocale.zhCN' },
    { value: 'en-US', labelKey: 'options.dateLocale.enUS' },
    { value: 'de-DE', labelKey: 'options.dateLocale.deDE' },
    { value: 'es-ES', labelKey: 'options.dateLocale.esES' },
    { value: 'ja-JP', labelKey: 'options.dateLocale.jaJP' },
    { value: 'pt-BR', labelKey: 'options.dateLocale.ptBR' },
  ];

  const currencyOptions = [
    { value: 'CNY', labelKey: 'options.currency.CNY' },
    { value: 'USD', labelKey: 'options.currency.USD' },
    { value: 'EUR', labelKey: 'options.currency.EUR' },
    { value: 'JPY', labelKey: 'options.currency.JPY' },
    { value: 'BRL', labelKey: 'options.currency.BRL' },
  ];

  const timezoneOptions = [
    { value: 'Asia/Shanghai', labelKey: 'options.timezone.shanghai' },
    { value: 'America/New_York', labelKey: 'options.timezone.newyork' },
    { value: 'Europe/London', labelKey: 'options.timezone.london' },
    { value: 'Europe/Berlin', labelKey: 'options.timezone.berlin' },
    { value: 'Europe/Madrid', labelKey: 'options.timezone.madrid' },
    { value: 'Asia/Tokyo', labelKey: 'options.timezone.tokyo' },
    { value: 'America/Sao_Paulo', labelKey: 'options.timezone.saopaulo' },
  ];
</script>

<h1>{t('title')}</h1>

<div class="settings-grid">
  <div class="setting-section">
    <h2>{t('title')}</h2>

    <div class="setting-item">
      <label>{t('preferences.locale')}</label>
      <select bind:value={preferences.locale}>
        {#each localeOptions as opt}
          <option value={opt.value}>{t(opt.labelKey)}</option>
        {/each}
      </select>
    </div>

    <div class="setting-item">
      <label>{t('preferences.numberFormat')}</label>
      <select bind:value={preferences.numberLocale}>
        {#each numberLocaleOptions as opt}
          <option value={opt.value}>{t(opt.labelKey)}</option>
        {/each}
      </select>
    </div>

    <div class="setting-item">
      <label>{t('preferences.currency')}</label>
      <select bind:value={preferences.currency}>
        {#each currencyOptions as opt}
          <option value={opt.value}>{t(opt.labelKey)}</option>
        {/each}
      </select>
    </div>

    <div class="setting-item">
      <label>{t('preferences.dateFormat')}</label>
      <select bind:value={preferences.dateLocale}>
        {#each dateLocaleOptions as opt}
          <option value={opt.value}>{t(opt.labelKey)}</option>
        {/each}
      </select>
    </div>

    <div class="setting-item">
      <label>{t('preferences.timezone')}</label>
      <select bind:value={preferences.timezone}>
        {#each timezoneOptions as opt}
          <option value={opt.value}>{t(opt.labelKey)}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="preview-section">
    <h2>{t('preview.title')}</h2>

    <div class="preview-item">
      <label>{t('preview.number')}</label>
      <p class="preview-value">{formattedNumber}</p>
    </div>

    <div class="preview-item">
      <label>{t('preview.currency')}</label>
      <p class="preview-value">{formattedCurrency}</p>
    </div>

    <div class="preview-item">
      <label>{t('preview.date')}</label>
      <p class="preview-value">{formattedDate}</p>
    </div>

    <div class="current-prefs">
      <h3>{t('preview.currentPrefs')}</h3>
      <pre>{prefsJson}</pre>
    </div>
  </div>
</div>

<!-- 开发者工具区域 -->
{#if !dev}
  <div class="devtools-section">
    <h2>{t('devtools.title')}</h2>
    <p class="devtools-desc">{t('devtools.desc')}</p>

    <button
      class="devtools-toggle"
      class:enabled={devToolsEnabled}
      onclick={toggleDevTools}
      disabled={devToolsLoading}
    >
      {#if devToolsLoading}
        {t('devtools.loading')}
      {:else if devToolsEnabled}
        {t('devtools.disable')}
      {:else}
        {t('devtools.enable')}
      {/if}
    </button>

    {#if devToolsEnabled}
      <p class="devtools-hint">{t('devtools.hint')}</p>
    {/if}
  </div>
{/if}

<style>
  h1 {
    margin-bottom: 24px;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
  }

  @media (max-width: 768px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }
  }

  .setting-section,
  .preview-section {
    background: #f9f9f9;
    padding: 24px;
    border-radius: 8px;
  }

  .setting-section h2,
  .preview-section h2 {
    margin: 0 0 20px;
    font-size: 18px;
  }

  .setting-item {
    margin-bottom: 16px;
  }

  .setting-item label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    color: #555;
  }

  .setting-item select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    background: white;
  }

  .preview-item {
    margin-bottom: 20px;
  }

  .preview-item label {
    display: block;
    margin-bottom: 4px;
    color: #666;
    font-size: 14px;
  }

  .preview-value {
    margin: 0;
    font-size: 24px;
    font-weight: bold;
    color: #0066cc;
  }

  .current-prefs {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #ddd;
  }

  .current-prefs h3 {
    margin: 0 0 12px;
    font-size: 14px;
    color: #666;
  }

  .current-prefs pre {
    margin: 0;
    padding: 12px;
    background: #333;
    color: #0f0;
    border-radius: 6px;
    font-size: 12px;
    overflow-x: auto;
  }

  /* DevTools Section */
  .devtools-section {
    margin-top: 32px;
    padding: 24px;
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 8px;
  }

  .devtools-section h2 {
    margin: 0 0 12px;
    font-size: 18px;
    color: #856404;
  }

  .devtools-desc {
    margin: 0 0 16px;
    color: #856404;
    font-size: 14px;
  }

  .devtools-toggle {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    background: #6c757d;
    color: white;
  }

  .devtools-toggle:hover:not(:disabled) {
    background: #5a6268;
  }

  .devtools-toggle.enabled {
    background: #28a745;
  }

  .devtools-toggle.enabled:hover:not(:disabled) {
    background: #218838;
  }

  .devtools-toggle:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .devtools-hint {
    margin: 12px 0 0;
    font-size: 13px;
    color: #856404;
    font-style: italic;
  }
</style>
