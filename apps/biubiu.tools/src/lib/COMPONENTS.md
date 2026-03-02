# UI Components vs Widgets

## Decision Guide

```
New component — where does it go?

  Is props the ONLY business input?
  (i18n, $app/environment, CSS frameworks = infrastructure, don't count)
     |
     +-- YES --> ui/
     |
     +-- NO  --> widgets/
```

"Business input" includes: stores, fetch/API calls, localStorage, context, goto, SDK instances, or any `$lib/*` business module.

## Quick Reference

### `ui/` — Pure Presentational

All data and callbacks come from props. Can be dropped into another project as-is.

| Component | Props |
|-----------|-------|
| ChainLogos | — |
| ResponsiveDrawer | open, onClose, title, children |
| ResponsiveModal | open, onClose, title, children |
| PageFooter | — |

### `widgets/` — Stateful / Data-Aware

Depend on something beyond props — they know where to get their data.

| Component | Business Dependency |
|-----------|---------------------|
| AbiViewer | `$lib/contractReader` (RPC calls) |
| AssetSearch | fetch() + goto |
| ChainSearch | fetch() + goto |
| ContractSearch | fetch() + goto |
| GitHubStars | fetch() + localStorage |
| PageHeader | imports SettingsPanel (widget child) |
| SearchBox | goto + hardcoded routes |
| SettingsPanel | `$lib/settings` + stores |
| ThemeToggle | `$lib/theme` |
| TranslateModeBar | translateMode store |
