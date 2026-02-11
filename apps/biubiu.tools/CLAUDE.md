You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

---

# BiuBiu Tools - Development Guidelines

This document outlines the design principles, code patterns, and best practices for developing pages in the BiuBiu Tools application.

## Design Philosophy & Aesthetic Goals

### Target Quality Level
Aim for **top-tier product portal** aesthetics, comparable to:
- Vercel (clean, minimalist, premium feel)
- Linear (attention to micro-interactions)
- Uniswap (modern web3 aesthetic)

### Core Design Principles

1. **Visual Depth Through Layers**
   - Use multi-layer background effects (gradient orbs, grid patterns)
   - Glass morphism with proper backdrop-filter
   - Subtle animations that add life without distraction

2. **Typography Excellence**
   - Headlines: font-weight 800, letter-spacing -0.02em to -0.05em
   - Use gradient text for highlighted phrases
   - Subtitles/descriptions should be more muted (`--fg-subtle` or `--fg-muted`)

3. **Premium Interactions**
   - Cards float on hover (`translateY(-6px)`)
   - Shine sweep animation on hover (skewX transform, left transition)
   - Glow effects on interactive elements
   - Respect `prefers-reduced-motion`

4. **Glass Morphism Pattern**
   ```css
   .glass-card {
     background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%);
     backdrop-filter: blur(20px) saturate(180%);
     border: 1px solid rgba(255, 255, 255, 0.12);
     box-shadow:
       0 8px 32px rgba(0, 0, 0, 0.4),
       0 0 0 1px rgba(255, 255, 255, 0.05) inset,
       0 1px 0 rgba(255, 255, 255, 0.1) inset;
   }
   ```

5. **Shine Sweep Effect**
   ```css
   .card::after {
     content: '';
     position: absolute;
     top: 0;
     left: -100%;
     width: 60%;
     height: 100%;
     background: linear-gradient(90deg,
       transparent 0%,
       rgba(255,255,255,0.03) 20%,
       rgba(255,255,255,0.15) 50%,
       rgba(255,255,255,0.03) 80%,
       transparent 100%
     );
     transform: skewX(-20deg);
     transition: left 0.7s var(--easing-smooth);
   }
   .card:hover::after { left: 150%; }
   ```

---

## CSS Token System

### Importing Styles
Styles are loaded in `+layout.svelte`:
```svelte
<script>
  import '../style/tokens.css';
  import '../style/theme-dark.css';
  import '../style/theme-light.css';
  import '../style/global.css';
</script>
```

### Spacing (4px grid)
```css
--space-0: 0;
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;
--space-4: 16px;  --space-5: 20px;  --space-6: 24px;
--space-8: 32px;  --space-10: 40px; --space-12: 48px;
--space-16: 64px; --space-20: 80px; --space-24: 96px;
```

### Typography
```css
/* Font sizes (scale with --text-scale) */
--text-xs: calc(11px * var(--text-scale));
--text-sm: calc(13px * var(--text-scale));
--text-base: calc(14px * var(--text-scale));
--text-md: calc(15px * var(--text-scale));
--text-lg: calc(16px * var(--text-scale));
--text-xl: calc(18px * var(--text-scale));
--text-2xl: calc(20px * var(--text-scale));
--text-3xl: calc(32px * var(--text-scale));
--text-4xl: calc(40px * var(--text-scale));
--text-5xl: calc(50px * var(--text-scale));
--text-6xl: calc(60px * var(--text-scale));

/* Font weights */
--weight-normal: 400;
--weight-medium: 500;
--weight-semibold: 600;
--weight-bold: 700;

/* Line heights */
--leading-none: 1;
--leading-tight: 1.25;
--leading-snug: 1.375;
--leading-normal: 1.5;
--leading-relaxed: 1.625;

/* Font families */
--font-sans: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
```

### Colors (Theme-aware)
```css
/* Backgrounds */
--bg-base       /* Main background */
--bg-raised     /* Elevated surfaces */
--bg-sunken     /* Recessed areas */
--bg-elevated   /* Highest elevation */
--bg-overlay    /* Modal overlays */

/* Foreground */
--fg-base       /* Primary text */
--fg-muted      /* Secondary text */
--fg-subtle     /* Tertiary text */
--fg-faint      /* Disabled/placeholder */
--fg-inverse    /* Text on accent */

/* Accent */
--accent        /* Primary action color */
--accent-hover  /* Hover state */
--accent-muted  /* Light background tint */
--accent-subtle /* Very light tint */
--accent-fg     /* Text on accent background */

/* Semantic */
--success / --success-muted
--warning / --warning-muted
--error / --error-muted
--info / --info-muted
```

### Border & Radius
```css
/* Borders */
--border-base   /* Default borders */
--border-strong /* Emphasized borders */
--border-subtle /* Subtle dividers */

/* Radius */
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-2xl: 24px;
--radius-full: 9999px;
```

### Motion & Effects
```css
/* Timing */
--motion-fast: 150ms;
--motion-normal: 250ms;
--motion-slow: 350ms;

/* Easing */
--easing: cubic-bezier(0.4, 0, 0.2, 1);
--easing-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
--easing-smooth: cubic-bezier(0.165, 0.85, 0.45, 1);

/* Shadows */
--shadow-sm / --shadow-md / --shadow-lg / --shadow-xl

/* Glows */
--glow-accent  /* Accent color glow */
--glow-soft    /* Subtle ambient glow */
--glow-intense /* Strong emphasis glow */
```

---

## i18n (Internationalization)

### Basic Translation
```svelte
<script lang="ts">
  import { t, localizeHref, locale } from '$lib/i18n';
  import type { TranslationKey } from '$i18n';
</script>

<!-- Simple translation -->
<h1>{t('hero.title')}</h1>

<!-- With interpolation -->
<p>{@html t('footer.madeWith', { love: '<span>♥</span>' })}</p>

<!-- Localized links -->
<a href={localizeHref('/tools/balance-radar')}>Go to Tool</a>
```

### Number Formatting
```svelte
<script>
  import { formatNumber, formatCurrency, formatPercent } from '$lib/i18n';
</script>

<!-- Basic number (respects user's numberLocale preference) -->
<span>{formatNumber(1234567.89)}</span>  <!-- "1,234,567.89" (en-US) -->

<!-- With options -->
<span>{formatNumber(1234.5, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>

<!-- Currency (respects user's currency preference) -->
<span>{formatCurrency(1234.56)}</span>  <!-- "$1,234.56" -->
<span>{formatCurrency(1234.56, 'EUR')}</span>  <!-- "€1,234.56" -->

<!-- Percentage -->
<span>{formatPercent(0.1234)}</span>  <!-- "12.34%" -->
<span>{formatPercent(0.1234, 0)}</span>  <!-- "12%" (0 decimal places) -->

<!-- BigInt / large numbers (avoids JS precision loss) -->
<span>{formatNumber(123456789012345678901234567890n)}</span>
```

### Date Formatting
```svelte
<script>
  import { formatDate, formatDateTime, formatRelativeTime } from '$lib/i18n';
</script>

<!-- Date only (respects user's dateLocale and timezone) -->
<span>{formatDate(new Date())}</span>  <!-- "Feb 10, 2026" -->
<span>{formatDate(new Date(), { dateStyle: 'full' })}</span>  <!-- "Tuesday, February 10, 2026" -->

<!-- Date and time -->
<span>{formatDateTime(new Date())}</span>  <!-- "Feb 10, 2026, 3:45 PM" -->
<span>{formatDateTime(new Date(), { dateStyle: 'short', timeStyle: 'long' })}</span>

<!-- Relative time -->
<span>{formatRelativeTime(Date.now() - 3600000)}</span>  <!-- "1 hour ago" -->
<span>{formatRelativeTime(Date.now() + 86400000)}</span>  <!-- "in 1 day" -->
```

### User Preferences
```svelte
<script>
  import { preferences } from '$lib/i18n';

  // Access reactive preferences
  const { numberLocale, dateLocale, currency, timezone } = $derived(preferences);
</script>
```

### Adding New Translation Keys
1. Add keys to `src/messages/en/_global.json` and `src/messages/zh/_global.json`
2. Type definitions are auto-generated at `$i18n` (TranslationKey type)
3. Use dot notation for nested keys: `section.subsection.key`

---

## SEO

### Basic Page SEO
```svelte
<script lang="ts">
  import { t, locale } from '$lib/i18n';
  import { getBaseSEO } from '$lib/seo';
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';

  const seoProps = $derived(getBaseSEO({
    title: t('page.title'),
    description: t('page.description'),
    currentLocale: locale.value,
  }));
</script>

<SEO {...seoProps} />
```

### With JSON-LD Schema
```svelte
<script lang="ts">
  import { getBaseSEO, buildSiteJsonLd } from '$lib/seo';

  const seoProps = $derived(getBaseSEO({
    title: t('meta.title'),
    description: t('meta.description'),
    currentLocale: locale.value,
    jsonLd: buildSiteJsonLd(),  // SoftwareApplication schema
    ogParams: {
      type: 'website',
      subtitle: t('hero.description')
    }
  }));
</script>
```

### Custom Tool Page SEO
```svelte
<script>
  const seoProps = $derived(getBaseSEO({
    title: `${t('tool.name')} - BiuBiu Tools`,
    description: t('tool.description'),
    currentLocale: locale.value,
    // Optional: custom OG image params
    ogParams: {
      type: 'article',
      title: t('tool.name'),
      subtitle: t('tool.tagline')
    }
  }));
</script>
```

---

## Page Template

```svelte
<script lang="ts">
  import { t, localizeHref, locale } from '$lib/i18n';
  import type { TranslationKey } from '$i18n';
  import { getBaseSEO } from '$lib/seo';
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
  import { fadeInUp } from '$lib/actions/fadeInUp';

  // SEO
  const seoProps = $derived(getBaseSEO({
    title: t('page.title'),
    description: t('page.description'),
    currentLocale: locale.value,
  }));
</script>

<SEO {...seoProps} />

<div class="page">
  <section class="hero" use:fadeInUp={{ delay: 0 }}>
    <h1 class="title">{t('page.heading')}</h1>
    <p class="description">{t('page.description')}</p>
  </section>

  <section class="content" use:fadeInUp={{ delay: 100 }}>
    <!-- Page content -->
  </section>
</div>

<style>
  .page {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6);
  }

  .hero {
    text-align: center;
    padding: var(--space-16) 0;
  }

  .title {
    font-size: var(--text-4xl);
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--fg-base);
    margin-bottom: var(--space-4);
  }

  .description {
    font-size: var(--text-lg);
    color: var(--fg-muted);
    max-width: 600px;
    margin: 0 auto;
  }

  .content {
    /* Use glass-card pattern for cards */
  }

  @media (max-width: 768px) {
    .title {
      font-size: var(--text-3xl);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    /* Disable animations */
  }
</style>
```

---

## Component Patterns

### Responsive Modal
```svelte
import ResponsiveModal from '$lib/components/ResponsiveModal.svelte';

<ResponsiveModal open={showModal} onClose={() => showModal = false} title="Modal Title">
  <!-- Content -->
</ResponsiveModal>
```

### Responsive Drawer (Mobile Navigation)
```svelte
import ResponsiveDrawer from '$lib/components/ResponsiveDrawer.svelte';

<ResponsiveDrawer open={showDrawer} onClose={() => showDrawer = false} title="Menu">
  <!-- Navigation links -->
</ResponsiveDrawer>
```

### Fade In Animation
```svelte
import { fadeInUp } from '$lib/actions/fadeInUp';

<section use:fadeInUp={{ delay: 100 }}>
  <!-- Content fades in and slides up -->
</section>
```

---

## File Structure

```
src/
├── lib/
│   ├── i18n.ts           # i18n exports (t, formatNumber, formatDate, etc.)
│   ├── seo.ts            # SEO helpers (getBaseSEO, buildSiteJsonLd)
│   ├── theme.ts          # Theme management
│   ├── components/       # Reusable components
│   └── actions/          # Svelte actions (fadeInUp, etc.)
├── messages/
│   ├── en/               # English translations
│   │   └── _global.json
│   └── zh/               # Chinese translations
│       └── _global.json
├── routes/
│   └── [[locale]]/       # Locale-aware routing
│       └── +page.svelte
└── style/
    ├── tokens.css        # Design tokens (spacing, typography, etc.)
    ├── theme-dark.css    # Dark theme colors
    ├── theme-light.css   # Light theme colors
    └── global.css        # Base styles
```
