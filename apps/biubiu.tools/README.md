# biubiu.tools

A SvelteKit project with i18n support.

## i18n (Internationalization)

This project uses `@shelchin/i18n` for internationalization, supporting English (default) and Chinese.

### Basic Usage

```svelte
<script lang="ts">
  import { t, locale, localizeHref } from '$lib/i18n';
</script>

<!-- Translation -->
<h1>{t('welcome')}</h1>

<!-- Localized links -->
<a href={localizeHref('/about')}>{t('nav.about')}</a>

<!-- Current locale -->
<p>Current: {locale.value}</p>

<!-- Language switch -->
<a href="/en">English</a>
<a href="/zh">中文</a>
```

### Adding Translations

Add translation keys to `src/messages/{locale}/_global.json`:

```json
// src/messages/en/_global.json
{
  "welcome": "Welcome to biubiu.tools",
  "nav.about": "About"
}

// src/messages/zh/_global.json
{
  "welcome": "欢迎来到 biubiu.tools",
  "nav.about": "关于"
}
```

### Route-specific Translations

Create message files matching your route structure:

```
src/messages/
├── en/
│   ├── _global.json      # Global translations
│   ├── dashboard.json    # /dashboard route
│   └── user/
│       └── [id].json     # /user/[id] dynamic route
└── zh/
    └── ...
```

### Formatting

```svelte
<script lang="ts">
  import { formatNumber, formatCurrency, formatDate } from '$lib/i18n';
</script>

<!-- Number formatting (locale-aware) -->
<p>{formatNumber(1234567.89)}</p>

<!-- Currency formatting -->
<p>{formatCurrency(99.99, 'USD')}</p>

<!-- Date formatting -->
<p>{formatDate(new Date())}</p>
```

### URL Structure

- `/en/...` - English pages
- `/zh/...` - Chinese pages
- Visiting `/` redirects to default locale (`/en`)

---

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
bun x sv create --template minimal --types ts --add prettier eslint vitest="usages:unit,component" playwright sveltekit-adapter="adapter:auto" devtools-json mcp="ide:claude-code,vscode,gemini+setup:remote" --install bun biubiu.tools
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
