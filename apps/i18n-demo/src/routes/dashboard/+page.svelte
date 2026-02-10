<script lang="ts">
  import { t, formatNumber, formatCurrency, localizeHref } from '$lib/i18n';

  // Mock data
  const stats = {
    users: 12345,
    revenue: 9876543210n,
    orders: 4567,
    growth: 0.156,
  };

  let notificationCount = $state(5);
</script>

<h1>{t('title')}</h1>

<div class="nav-links">
  <a href={localizeHref('/dashboard/analytics')} class="sub-link">{t('nav.analytics')} &rarr;</a>
</div>

<div class="stats-grid">
  <div class="stat-card">
    <h3>{t('stats.users')}</h3>
    <p class="value">{formatNumber(stats.users)}</p>
  </div>

  <div class="stat-card">
    <h3>{t('stats.revenue')}</h3>
    <p class="value">{formatCurrency(stats.revenue)}</p>
  </div>

  <div class="stat-card">
    <h3>{t('stats.orders')}</h3>
    <p class="value">{formatNumber(stats.orders)}</p>
  </div>

  <div class="stat-card">
    <h3>{t('stats.growth')}</h3>
    <p class="value positive">{formatNumber(stats.growth, { style: 'percent' })}</p>
  </div>
</div>

<section class="notifications">
  <h2>{t('notifications', { count: notificationCount })}</h2>
  <div class="controls">
    <button onclick={() => notificationCount = Math.max(0, notificationCount - 1)}>-</button>
    <span>{notificationCount}</span>
    <button onclick={() => notificationCount++}>+</button>
  </div>
  <p class="hint">{t('pluralHint')}</p>
</section>

<style>
  h1 {
    margin-bottom: 16px;
  }

  .nav-links {
    margin-bottom: 24px;
  }

  .sub-link {
    display: inline-block;
    padding: 8px 16px;
    background: #e8f4ff;
    color: #0066cc;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 500;
  }

  .sub-link:hover {
    background: #0066cc;
    color: white;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 32px;
  }

  .stat-card {
    background: white;
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 20px;
    text-align: center;
  }

  .stat-card h3 {
    margin: 0 0 12px;
    color: #666;
    font-size: 14px;
    font-weight: normal;
  }

  .stat-card .value {
    margin: 0;
    font-size: 28px;
    font-weight: bold;
    color: #333;
  }

  .stat-card .value.positive {
    color: #22c55e;
  }

  .notifications {
    background: #f9f9f9;
    padding: 24px;
    border-radius: 8px;
  }

  .notifications h2 {
    margin: 0 0 16px;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .controls button {
    width: 36px;
    height: 36px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 4px;
    font-size: 18px;
    cursor: pointer;
  }

  .controls span {
    font-size: 24px;
    font-weight: bold;
    min-width: 40px;
    text-align: center;
  }

  .hint {
    margin-top: 12px;
    color: #888;
    font-size: 14px;
  }
</style>
