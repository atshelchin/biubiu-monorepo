<script lang="ts">
  import {
    t,
    formatNumber,
    formatCurrency,
    formatDate,
    formatRelativeTime,
    parseNumber,
    preferences,
  } from '$lib/i18n';
  import {
    formatPercent,
    parseNumberToFloat,
    isValidLocalizedNumber,
    maskNumberInput,
  } from '@shelchin/i18n';

  // BigInt 示例 (超过 JavaScript Number 精度)
  const bigAmount = 1234567890123456789n;
  const veryBigAmount = 9999999999999999999999n;

  // 极小数示例
  const smallAmount = 0.00000000456;
  const tinyAmount = 0.000000000000123;

  // 日期示例
  const now = new Date();
  const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 天前
  const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 小时后

  // 数字输入状态
  let numberInput = $state('');
  let parsedResult = $derived.by(() => {
    if (!numberInput) return null;
    const isValid = isValidLocalizedNumber(numberInput);
    const parsed = parseNumber(numberInput);
    const asFloat = parseNumberToFloat(numberInput);
    return { isValid, parsed, asFloat };
  });

  // 输入掩码演示
  let maskedInput = $state('');
  let maskedValue = $derived(maskNumberInput(maskedInput));

  // 百分比示例
  const percentValue = 0.1234;

  // 响应式格式化值
  const formattedBigAmount = $derived(formatNumber(bigAmount));
  const formattedVeryBig = $derived(formatNumber(veryBigAmount));
  const formattedSmall = $derived(formatNumber(smallAmount, { significantDigits: 3 }));
  const formattedTiny = $derived(formatNumber(tinyAmount, { significantDigits: 2 }));
  const formattedPercent = $derived(formatPercent(percentValue));
  const formattedCurrency = $derived(formatCurrency(bigAmount));
  const formattedDate = $derived(formatDate(now, { dateStyle: 'full', timeStyle: 'long' }));
  const relativeTimePast = $derived(formatRelativeTime(pastDate));
  const relativeTimeFuture = $derived(formatRelativeTime(futureDate));
</script>

<h1>{t('welcome', { name: 'Developer' })}</h1>

<!-- 数字输入解析 -->
<section class="highlight">
  <h2>{t('home.parse.title')}</h2>
  <p>{t('home.parse.desc')}</p>

  <div class="input-group">
    <label>{t('home.parse.input')}</label>
    <input
      type="text"
      bind:value={numberInput}
      placeholder={t('home.parse.placeholder')}
    />
  </div>

  {#if parsedResult}
    <div class="result-box">
      <p>
        <span class="label">{t('home.parse.valid')}:</span>
        <span class={parsedResult.isValid ? 'valid' : 'invalid'}>
          {parsedResult.isValid ? '✓' : '✗'}
        </span>
      </p>
      <p>
        <span class="label">{t('home.parse.normalized')}:</span>
        <code>{parsedResult.parsed}</code>
      </p>
      <p>
        <span class="label">{t('home.parse.asNumber')}:</span>
        <code>{parsedResult.asFloat}</code>
      </p>
    </div>
  {/if}

  <p class="hint">{t('home.parse.hint')}</p>
</section>

<!-- 输入掩码 -->
<section>
  <h2>{t('home.mask.title')}</h2>
  <p>{t('home.mask.desc')}</p>

  <div class="input-group">
    <label>{t('home.mask.input')}</label>
    <input
      type="text"
      bind:value={maskedInput}
      placeholder="123456789"
    />
  </div>

  <p>
    <span class="label">{t('home.mask.formatted')}:</span>
    <strong>{maskedValue}</strong>
  </p>
</section>

<!-- BigInt 格式化 -->
<section>
  <h2>{t('home.bigint.title')}</h2>
  <table class="demo-table">
    <tbody>
      <tr>
        <td>{t('home.bigint.original')}</td>
        <td><code>1234567890123456789n</code></td>
        <td><strong>{formattedBigAmount}</strong></td>
      </tr>
      <tr>
        <td>{t('home.bigint.veryLarge')}</td>
        <td><code>9999999999999999999999n</code></td>
        <td><strong>{formattedVeryBig}</strong></td>
      </tr>
      <tr>
        <td>{t('home.bigint.currency')}</td>
        <td><code>1234567890123456789n</code></td>
        <td><strong>{formattedCurrency}</strong></td>
      </tr>
    </tbody>
  </table>
</section>

<!-- 极小数格式化 -->
<section>
  <h2>{t('home.decimal.title')}</h2>
  <table class="demo-table">
    <tbody>
      <tr>
        <td>{t('home.decimal.3digits')}</td>
        <td><code>0.00000000456</code></td>
        <td><strong>{formattedSmall}</strong></td>
      </tr>
      <tr>
        <td>{t('home.decimal.2digits')}</td>
        <td><code>0.000000000000123</code></td>
        <td><strong>{formattedTiny}</strong></td>
      </tr>
    </tbody>
  </table>
</section>

<!-- 百分比格式化 -->
<section>
  <h2>{t('home.percent.title')}</h2>
  <p>
    <span class="label">{t('home.bigint.original')}:</span>
    <code>0.1234</code>
  </p>
  <p>
    <span class="label">{t('home.percent.formatted')}:</span>
    <strong>{formattedPercent}</strong>
  </p>
</section>

<!-- 日期和时间 -->
<section>
  <h2>{t('home.date.title')}</h2>
  <p>
    <span class="label">{t('home.date.current')}:</span>
    <strong>{formattedDate}</strong>
  </p>
  <p>
    <span class="label">{t('home.date.timezone')}:</span>
    <code>{preferences.timezone}</code>
  </p>
</section>

<!-- 相对时间 -->
<section>
  <h2>{t('home.relative.title')}</h2>
  <p>
    <span class="label">{t('home.relative.past')}:</span>
    <strong>{relativeTimePast}</strong>
  </p>
  <p>
    <span class="label">{t('home.relative.future')}:</span>
    <strong>{relativeTimeFuture}</strong>
  </p>
</section>

<!-- 开发提示 -->
<section class="tip">
  <h3>{t('home.tip.title')}</h3>
  <p>{t('home.tip.desc')}</p>
</section>

<style>
  h1 {
    color: #333;
    margin-bottom: 32px;
  }

  section {
    background: #f9f9f9;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  section.highlight {
    background: #fffbeb;
    border: 1px solid #f59e0b;
  }

  section h2 {
    margin-top: 0;
    font-size: 18px;
    color: #666;
  }

  code {
    background: #eee;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
  }

  strong {
    color: #0066cc;
  }

  .tip {
    background: #e8f4ff;
    border-left: 4px solid #0066cc;
  }

  .tip h3 {
    margin-top: 0;
  }

  .input-group {
    margin: 16px 0;
  }

  .input-group label {
    display: block;
    margin-bottom: 4px;
    font-weight: 500;
  }

  .input-group input {
    width: 100%;
    max-width: 300px;
    padding: 8px 12px;
    font-size: 16px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .result-box {
    background: #fff;
    padding: 12px;
    border-radius: 4px;
    margin: 12px 0;
  }

  .result-box p {
    margin: 4px 0;
  }

  .label {
    color: #666;
    min-width: 100px;
    display: inline-block;
  }

  .valid {
    color: #16a34a;
    font-weight: bold;
  }

  .invalid {
    color: #dc2626;
    font-weight: bold;
  }

  .hint {
    font-size: 14px;
    color: #888;
    font-style: italic;
  }

  .demo-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
  }

  .demo-table td {
    padding: 8px;
    border-bottom: 1px solid #eee;
  }

  .demo-table td:first-child {
    color: #666;
    width: 30%;
  }

  .demo-table td:nth-child(2) {
    width: 40%;
  }
</style>
