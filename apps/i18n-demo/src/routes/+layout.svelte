<script lang="ts">
  import { t, localizeHref, locale } from '$lib/i18n';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { removeLocaleFromPathname, i18nState } from '@shelchin/i18n-sveltekit';
  import { browser } from '$app/environment';

  let { data, children } = $props();

  // Update i18nState when navigation completes (not during preload)
  // This effect runs when data changes after actual navigation
  $effect(() => {
    if (browser && data.messages && data.locale) {
      i18nState.setMessages(data.messages);
      i18nState.locale = data.locale;
    }
  });

  // Supported locales
  const SUPPORTED_LOCALES = ['zh', 'en', 'de', 'es', 'ja', 'pt'];

  // Get current locale - reactive
  const currentLocale = $derived(locale.value);

  // Switch language
  function switchLocale(lang: string) {
    const pathWithoutLocale = removeLocaleFromPathname(page.url.pathname, SUPPORTED_LOCALES);
    goto(`/${lang}${pathWithoutLocale}`);
  }
</script>

<div class="app">
  <nav>
    <div class="nav-left">
      <a href={localizeHref('/')}>{t('nav.home')}</a>
      <a href={localizeHref('/dashboard')}>{t('nav.dashboard')}</a>
      <a href={localizeHref('/settings')}>{t('nav.settings')}</a>
      <a href={localizeHref('/user/123')}>{t('nav.user') || 'User'}</a>
    </div>
    <div class="nav-right">
      <button onclick={() => switchLocale('zh')} class:active={currentLocale === 'zh'}>
        中文
      </button>
      <button onclick={() => switchLocale('en')} class:active={currentLocale === 'en'}>
        EN
      </button>
      <button onclick={() => switchLocale('de')} class:active={currentLocale === 'de'}>
        DE
      </button>
      <button onclick={() => switchLocale('es')} class:active={currentLocale === 'es'}>
        ES
      </button>
      <button onclick={() => switchLocale('ja')} class:active={currentLocale === 'ja'}>
        日本語
      </button>
      <button onclick={() => switchLocale('pt')} class:active={currentLocale === 'pt'}>
        PT
      </button>
    </div>
  </nav>

  <main>
    {@render children()}
  </main>
</div>

<style>
  .app {
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0;
    border-bottom: 1px solid #eee;
    margin-bottom: 24px;
  }

  .nav-left {
    display: flex;
    gap: 24px;
  }

  .nav-left a {
    text-decoration: none;
    color: #333;
    font-weight: 500;
  }

  .nav-left a:hover {
    color: #0066cc;
  }

  .nav-right {
    display: flex;
    gap: 8px;
  }

  .nav-right button {
    padding: 6px 12px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 4px;
    cursor: pointer;
  }

  .nav-right button.active {
    background: #0066cc;
    color: white;
    border-color: #0066cc;
  }

  main {
    min-height: 400px;
  }
</style>
