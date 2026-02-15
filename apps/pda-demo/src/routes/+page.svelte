<script lang="ts">
  import { batchBalanceApp, NETWORKS } from '$lib/batch-balance-app';
</script>

<svelte:head>
  <title>PDA Demo - Protocol-Driven Applications</title>
</svelte:head>

<div class="hero">
  <h1>Protocol-Driven Applications</h1>
  <p class="subtitle">
    Build headless applications with declarative schemas.
    Same logic runs in GUI, CLI, and AI Agent environments.
  </p>
</div>

<div class="apps">
  <a href="/batch-balance" class="app-card card">
    <div class="app-icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    </div>
    <div class="app-info">
      <h3>{batchBalanceApp.manifest.name}</h3>
      <p>{batchBalanceApp.manifest.description}</p>
      <div class="app-meta">
        <span class="badge">v{batchBalanceApp.manifest.version}</span>
        <span class="networks">{Object.keys(NETWORKS).length} networks</span>
      </div>
    </div>
  </a>

  <a href="/batch-balance-auto" class="app-card card">
    <div class="app-icon auto">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    </div>
    <div class="app-info">
      <h3>{batchBalanceApp.manifest.name} (Auto)</h3>
      <p>Same app, auto-rendered using pda-sveltekit</p>
      <div class="app-meta">
        <span class="badge auto">pda-sveltekit</span>
        <span class="networks">Zero config UI</span>
      </div>
    </div>
  </a>

  <a href="/batch-balance-auto2" class="app-card card">
    <div class="app-icon custom">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 3l9 4.5v9L12 21l-9-4.5v-9L12 3z"/>
        <path d="M12 12l9-4.5"/>
        <path d="M12 12v9"/>
        <path d="M12 12L3 7.5"/>
      </svg>
    </div>
    <div class="app-info">
      <h3>{batchBalanceApp.manifest.name} (Custom)</h3>
      <p>Auto-rendered with custom input/output renderers</p>
      <div class="app-meta">
        <span class="badge custom">Custom Renderers</span>
        <span class="networks">Same UI as manual</span>
      </div>
    </div>
  </a>
</div>

<style>
  .hero {
    text-align: center;
    padding: 48px 0;
  }

  h1 {
    font-size: 36px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .subtitle {
    font-size: 18px;
    color: var(--text-secondary);
    max-width: 500px;
    margin: 0 auto;
  }

  .apps {
    display: grid;
    gap: 20px;
    margin-top: 32px;
  }

  .app-card {
    display: flex;
    gap: 20px;
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .app-card:hover {
    transform: translateY(-2px);
  }

  .app-icon {
    flex-shrink: 0;
    width: 56px;
    height: 56px;
    background: rgba(10, 132, 255, 0.1);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
  }

  .app-icon.auto {
    background: rgba(48, 209, 88, 0.1);
    color: var(--success, #30d158);
  }

  .app-icon.custom {
    background: rgba(255, 159, 10, 0.1);
    color: var(--warning, #ff9f0a);
  }

  .app-info {
    flex: 1;
  }

  .app-info h3 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .app-info p {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 12px;
  }

  .app-meta {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .badge {
    font-size: 12px;
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: var(--text-secondary);
  }

  .badge.auto {
    background: rgba(48, 209, 88, 0.15);
    color: var(--success, #30d158);
  }

  .badge.custom {
    background: rgba(255, 159, 10, 0.15);
    color: var(--warning, #ff9f0a);
  }

  .networks {
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
