<script lang="ts">
  /**
   * Token Airdrop Demo Page
   *
   * Showcases the three-mode input system with a complex multi-step form.
   * Use the mode switcher in the header to see how the same form adapts
   * to different user expertise levels.
   */
  import { PDAApp, type InputMode } from '@shelchin/pda-sveltekit';
  import { tokenAirdropApp } from '$lib/token-airdrop-app';
  import AirdropFormRenderer from '$lib/renderers/AirdropFormRenderer.svelte';

  // Track the current mode for demonstration
  let currentMode = $state<InputMode>('guided');
</script>

<svelte:head>
  <title>Token Airdrop | PDA Demo</title>
</svelte:head>

<div class="demo-page">
  <nav class="demo-nav">
    <a href="/" class="back-link">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Back to Examples
    </a>
  </nav>

  <div class="demo-intro">
    <h2>Three-Mode Input System Demo</h2>
    <p>
      This complex form demonstrates how the <strong>guided</strong>, <strong>standard</strong>,
      and <strong>expert</strong> modes adapt the same form to different user expertise levels.
    </p>
    <ul class="mode-descriptions">
      <li>
        <span class="mode-badge guided">🐣 Guided</span>
        Step-by-step wizard with detailed explanations. Perfect for first-time users.
      </li>
      <li>
        <span class="mode-badge standard">⚡ Standard</span>
        Sections reveal progressively as you complete them. Balanced UX.
      </li>
      <li>
        <span class="mode-badge expert">🚀 Expert</span>
        Everything visible at once in a compact layout. Maximum efficiency.
      </li>
    </ul>
    <p class="mode-note">
      Use the mode switcher in the app header to switch modes.
      <strong>Your form data is preserved</strong> when switching modes!
    </p>
  </div>

  <div class="demo-container">
    <PDAApp
      app={tokenAirdropApp}
      inputMode={currentMode}
      showModeSwitch={true}
      onModeChange={(mode) => currentMode = mode}
      formRenderer={AirdropFormRenderer}
      onSubmit={(input) => {
        console.log('Airdrop submission:', input);
      }}
      onComplete={(result) => {
        console.log('Airdrop complete:', result);
      }}
      onError={(error) => {
        console.error('Airdrop error:', error);
      }}
    />
  </div>

  <div class="demo-footer">
    <p>
      This example uses a <strong>complex nested schema</strong> with 6 sections:
      Network & Token, Distribution Method, Recipients, Gas Settings, Scheduling, and Advanced Options.
    </p>
    <p>
      The form demonstrates how progressive disclosure reduces cognitive load while
      expert users can access all options immediately.
    </p>
  </div>
</div>

<style>
  .demo-page {
    min-height: 100vh;
    background: var(--bg-primary, #0a0a0a);
    color: var(--text-primary, #fff);
    padding: 24px;
  }

  .demo-nav {
    margin-bottom: 32px;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--accent, #0a84ff);
    text-decoration: none;
    font-size: 14px;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .demo-intro {
    max-width: 700px;
    margin: 0 auto 40px;
    text-align: center;
  }

  .demo-intro h2 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .demo-intro p {
    font-size: 15px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.7));
    line-height: 1.6;
    margin-bottom: 20px;
  }

  .mode-descriptions {
    list-style: none;
    padding: 0;
    margin: 0;
    text-align: left;
  }

  .mode-descriptions li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    font-size: 14px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.7));
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.06));
  }

  .mode-badge {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }

  .mode-badge.guided {
    background: rgba(255, 204, 0, 0.15);
    color: #ffcc00;
  }

  .mode-badge.standard {
    background: rgba(10, 132, 255, 0.15);
    color: #0a84ff;
  }

  .mode-badge.expert {
    background: rgba(255, 69, 58, 0.15);
    color: #ff453a;
  }

  .mode-note {
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    padding: 14px 18px;
    font-size: 13px;
    text-align: left;
    margin-top: 16px;
  }

  .mode-note strong {
    color: var(--success, #30d158);
  }

  .demo-container {
    max-width: 900px;
    margin: 0 auto;
  }

  .demo-footer {
    max-width: 700px;
    margin: 48px auto 0;
    padding-top: 32px;
    border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    text-align: center;
  }

  .demo-footer p {
    font-size: 13px;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
    line-height: 1.6;
    margin-bottom: 10px;
  }

  /* PDAApp overrides for dark theme */
  :global(.pda-app) {
    --pda-bg-primary: #1a1a1a;
    --pda-bg-secondary: #141414;
    --pda-text-primary: #fff;
    --pda-text-secondary: rgba(255, 255, 255, 0.7);
    --pda-border: rgba(255, 255, 255, 0.08);
    --pda-accent: #0a84ff;
  }
</style>
