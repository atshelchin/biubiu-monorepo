<script lang="ts">
  import { t, formatNumber, localizeHref } from '$lib/i18n';

  // Mock analytics data
  const stats = {
    pageViews: 125678,
    visitors: 45234,
    bounceRate: 0.324,
    avgDuration: 185,
  };

  const lastUpdated = new Date().toLocaleTimeString();
</script>

<div class="analytics-page">
  <div class="header">
    <a href={localizeHref('/dashboard')} class="back-link">&larr; {t('dashboard.shared.back')}</a>
    <h1>{t('analytics.title')}</h1>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <h3>{t('analytics.pageViews')}</h3>
      <p class="value">{formatNumber(stats.pageViews)}</p>
      <span class="trend positive">{t('analytics.trend', { percent: '+12.5%' })}</span>
    </div>

    <div class="stat-card">
      <h3>{t('analytics.visitors')}</h3>
      <p class="value">{formatNumber(stats.visitors)}</p>
      <span class="trend positive">{t('analytics.trend', { percent: '+8.2%' })}</span>
    </div>

    <div class="stat-card">
      <h3>{t('analytics.bounceRate')}</h3>
      <p class="value">{formatNumber(stats.bounceRate, { style: 'percent' })}</p>
      <span class="trend negative">{t('analytics.trend', { percent: '+2.1%' })}</span>
    </div>

    <div class="stat-card">
      <h3>{t('analytics.avgDuration')}</h3>
      <p class="value">{Math.floor(stats.avgDuration / 60)}:{(stats.avgDuration % 60).toString().padStart(2, '0')}</p>
      <span class="trend positive">{t('analytics.trend', { percent: '+15s' })}</span>
    </div>
  </div>

  <p class="last-updated">{t('analytics.lastUpdated', { time: lastUpdated })}</p>
</div>

<style>
  .analytics-page {
    padding: 0;
  }

  .header {
    margin-bottom: 24px;
  }

  .back-link {
    display: inline-block;
    margin-bottom: 12px;
    color: #666;
    text-decoration: none;
    font-size: 14px;
  }

  .back-link:hover {
    color: #0066cc;
  }

  h1 {
    margin: 0;
    font-size: 28px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: white;
    border: 1px solid #eee;
    border-radius: 12px;
    padding: 24px;
  }

  .stat-card h3 {
    margin: 0 0 8px;
    color: #666;
    font-size: 14px;
    font-weight: normal;
  }

  .stat-card .value {
    margin: 0 0 8px;
    font-size: 32px;
    font-weight: bold;
    color: #333;
  }

  .trend {
    font-size: 13px;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .trend.positive {
    color: #22c55e;
    background: #dcfce7;
  }

  .trend.negative {
    color: #ef4444;
    background: #fee2e2;
  }

  .last-updated {
    color: #888;
    font-size: 14px;
    text-align: right;
  }
</style>
