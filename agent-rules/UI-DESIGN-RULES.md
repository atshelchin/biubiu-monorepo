# UI Design Rules (biubiu.tools)

Authoritative design + front-end standard for biubiu.tools. When any agent builds or
changes UI, follow this. It resolves the historical conflict between the two CLAUDE.md
files: **the Apple-clean, token-driven direction below wins** — the glass-morphism /
glow / gradient-orb / shine-sweep guidance is retired.

Target quality bar: Vercel / Linear / Stripe — clean, calm, crisp, beginner-obvious.
"Looks like a big-company tool, easy for a novice to use."

## 1. Theme correctness is non-negotiable

The app ships **light and dark** themes via `[data-theme]` + CSS variables. Every color
MUST come from a token so both themes work.

- **NEVER hardcode** `rgba(255,255,255,x)` / `rgba(0,0,0,x)` / hex for backgrounds,
  borders, hovers, or status. White-on-white is invisible in light mode — this was the
  single biggest "looks amateur" bug in the Chain Explorer.
- Surfaces: `--bg-base` (page) · `--bg-raised` / `--bg-sunken` (recessed) · `--bg-elevated` (cards).
- Text: `--fg-base` / `--fg-muted` / `--fg-subtle` / `--fg-faint`.
- Borders: `--border-subtle` / `--border-base` / `--border-strong`.
- Status: `--success|warning|error|info` (+ `-muted` / `-subtle`). Never hardcode `#34d399` etc.

## 2. Cards & surfaces (the house pattern)

```css
.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-base);
  box-shadow: var(--shadow-sm);
  border-radius: var(--radius-lg);
}
.card:hover {           /* only if interactive */
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);   /* 1–2px max */
}
```

- List/row hover background = `--bg-raised` / `--bg-sunken` (a real tint), never "brighten toward white".
- Grouped lists (RPC rows, settings): one rounded panel, hairline `--border-subtle` dividers, `overflow: hidden`.

## 3. Motion

- Subtle only: hover translate ≤ 2px. **No glow, no pulse, no shine-sweep, no gradient orbs.**
- Use `--motion-fast`/`--easing`. Always add `@media (prefers-reduced-motion: reduce)` to disable animations.

## 4. Loading & lists

- Loading → **skeleton shimmer** (token bg + gentle `translateX` shimmer, off under reduced-motion), not a bare spinner.
- Large lists (hundreds+) → **progressive load**: render a chunk, append on scroll via
  `IntersectionObserver` (rootMargin ~600px) + a "Load more" fallback + "Showing X of Y". Never dump thousands of rows.

## 5. Inputs & search

- Inputs use `--bg-elevated` + `--border-base`; focus = `border-color: var(--accent)` + `box-shadow: 0 0 0 3px var(--accent-ring)`.
- Search: `⌘K`/`Ctrl-K` focus, dropdown on `--bg-elevated` + `--shadow-lg`, result icons, real combobox a11y (`role="combobox"` on the input, `role="option"`, `aria-selected`).

## 6. Iconography & logos

- Use `@lucide/svelte`. Verify the export name exists in the installed version (`Loader2` → `LoaderCircle` in 0.511).
- Don't put a `--bg-sunken` tile behind opaque logos — it's redundant; let the icon sit bare. Keep the tile only for skeleton placeholders.

## 7. Feedback (never bury errors in console)

- Surface failures **in the UI**: an inline alert (`--error-subtle` bg + `--error-muted` border + `TriangleAlert` + dismiss ×) showing the real reason. `console.error` is for devs, not users.
- Success/transient states auto-revert (~2.5s); error banners persist until dismissed or retried.

## 8. Front-end engineering

- **Shared data layer per feature** (e.g. `$lib/chains/`): dedupe types/fetch/helpers; cache fetched indexes in a module-level promise so multiple consumers share one request.
- **Svelte 5 reactive collections**: use `SvelteMap` / `SvelteSet` from `svelte/reactivity` — eslint `svelte/prefer-svelte-reactivity` errors on `$state(new Map())`.
- Avoid unused `_` in `{#each Array(n) as _, i}` — precompute `[...Array(n).keys()]` and iterate the index.
- **i18n**: route-scoped message files; **all 15 locales must stay key-complete** (type-gen
  reference locale is the first readdir dir = `de`). Script multi-locale key additions; never add to `en` alone.
- After `bun run check`, **restart any live `vite dev`** — type-gen clobbers the running server's `$i18n` (all routes 500 until restart).

## 9. Wallet "Add to network" (EIP-3085/3326)

`eth_requestAccounts` (else "Wallet not connected") → `wallet_switchEthereumChain` →
only on unknown-chain fall back to `wallet_addEthereumChain`. Pass **only http(s)** RPC
(wallets reject `ws://`); MetaMask refuses to *add* its built-in default chains, so switch
handles them. Keep it self-contained (talk to `window.ethereum`), don't couple to the app wallet store.

## Known accepted lint

`svelte/no-navigation-without-resolve` (~79 repo hits) conflicts with the app's
`localizeHref` i18n routing + external links. Do not "fix" it per-file with `resolve()`.
