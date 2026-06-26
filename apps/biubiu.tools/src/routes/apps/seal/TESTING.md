# Seal · 封存 — browser test playbook (for code agents)

**How to use this**

> Tell any code agent: "Follow `apps/biubiu.tools/src/routes/apps/seal/TESTING.md` and test **Seal / 封存** (`/apps/seal`) end-to-end with the chrome-devtools MCP. Run each item and report PASS/FAIL (FAIL must include the actual symptom + screenshot/snapshot)."

This is an executable QA script. It also captures the hard-won quirks of *this* app so the agent doesn't re-discover them.

- **App URL:** `http://localhost:5173/apps/seal` (the old `/apps/capsule` now **308-redirects** here — verify that too).
- **Files:** route `src/routes/apps/seal/+page.svelte`; store `src/lib/pda-apps/capsule/store.svelte.ts`; onboarding `src/lib/pda-apps/capsule/CapsuleOnboard.svelte`; networks `src/lib/pda-apps/capsule/networks.ts`; i18n `src/messages/<locale>/apps/seal.json` (key prefix is **`capsule.`** — decoupled from the filename, like `ws.`/`ts.` in other apps; don't "fix" it). Contract `apps/biubiu-contracts/src/tools/Seal.sol`.
- **Frozen, do NOT change:** the crypto salts (`forever.biubiu.tools/*`) and `forever.*` localStorage keys are deliberately kept under the old name — changing them would orphan already-sealed notes. See the FROZEN comments in `crypto/envelope.ts`, `crypto/prf.ts`, `store.svelte.ts`.
- **What it does:** write a **private note**, **AES-GCM encrypted client-side** (the key is derived from your passkey via WebAuthn PRF — nothing key-related is ever published on-chain), then **sealed on-chain** through a passkey Safe (ERC-4337). A per-write fee of **0.001 native** is charged and forwarded straight to the protocol treasury; **one note per chain every 12h**. Past notes are read back from contract state and decrypted in the timeline ("Past notes"). **There is no time-lock** — a note is readable by you anytime, and by no one else ever.

> **⚠️ Hard automation ceiling — read first.** Past the **chain gate**, *everything* sits behind a **biubiu passkey wallet** (`CapsuleOnboard`): you must (1) create/open a passkey identity (WebAuthn `navigator.credentials.create/get` + biometric) and (2) derive the **PRF** encryption key (another passkey touch). Headless/MCP Chrome has **no authenticator and no PRF**, so the writing sheet, timeline, seal, and funding modal are **not reachable without a real funded passkey wallet + a human biometric tap.** Scope those to **"UI + validation + error-copy only; full flow needs a funded passkey wallet + manual biometric."** Fully automatable: chain-gate, masthead/SEO, onboarding step-1/step-2 UI, settings, i18n, theme, responsive, console hygiene, the legacy-route redirect. Items are tagged **[AUTO]** or **[GATED]**.

---

## 0. Setup & environment

1. **Dev server** up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/seal` → expect `200`. If not: `cd apps/biubiu.tools && bun run dev`.
2. Use chrome-devtools MCP tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `list_network_requests`, `wait_for`).
3. Desktop viewport `1280×900`; mobile `390×844`.

### 0.1 chrome-devtools-MCP gotchas (COPY THESE — they bite every run)

- **Profile lock / "browser is already running".** Recover:
  ```bash
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"      # cheap unlock first
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2                   # hard reset if still stuck
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*
  ```
  Rule of thumb: one unlock buys ~1–2 MCP calls. Batch your work.
- **Blank screenshots / `about:blank` resets.** Before trusting a screenshot, sanity-check:
  ```js
  evaluate_script: () => ({ url: location.href, h1: document.querySelector('h1')?.textContent, h2: document.querySelector('h2')?.textContent })
  ```
  If `url` is `about:blank` or `h1` is null, re-navigate and redo. Prefer `take_snapshot`/`evaluate_script` over screenshots for assertions.
- **Svelte 5 binding:** `el.value = …` does NOT trigger `bind:value`. Use the native setter + dispatch:
  ```js
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  set.call(el, 'xxx'); el.dispatchEvent(new Event('input', { bubbles: true }));
  ```
  (The note box is `<textarea class="paper">` bound to `store.text`; the onboarding name box is `<input class="field">`. Both are gated behind login.)
- **Theme:** force via `navigate_page` initScript: `localStorage.setItem('biubiu-settings', JSON.stringify({ theme: 'light' }))` (or `'dark'`).
- **i18n raw-key caveat:** the embedded message JSON legitimately contains raw `capsule.*` keys as hydration data. **Only judge VISIBLE rendered text.** A *visible* raw key on screen (e.g. you literally see `capsule.brand`) IS a FAIL.

### 0.2 App-specific quirks

- **Locale is a cookie + reload**, not a runtime swap. Set it then re-navigate:
  ```js
  document.cookie = 'locale=zh;path=/;max-age=31536000;SameSite=Lax';
  ```
  Valid codes: `de en es-MX fr id it ja ko pt-BR ru tr vi zh zh-HK zh-TW`.
- **Region gate first.** On first load (no saved chain) you must pick a chain before anything else renders. The choice is remembered in `localStorage` (`forever.chain` / `forever.entered`).
- **No time-lock anywhere.** If you see a date picker, a "lock until" toggle, a countdown, or a "sealed/locked" note state, that's a **FAIL** (leftover from the old Capsule app).

---

## 1. Checklist

### A. Legacy redirect — [AUTO]
- [ ] `GET /apps/capsule` redirects (308) to `/apps/seal`. Verify the final URL is `/apps/seal` and the page renders.

### B. Masthead, brand & SEO — [AUTO]
- [ ] Brand shows **"Seal"** (en) / **"封存"** (zh) — never a raw `capsule.brand` key.
- [ ] Tagline reads **"Seal it once. Yours alone, forever."** (localized).
- [ ] `<title>` and `meta[name=description]` are the Seal copy (no "Capsule", no "letter to your future self", no "time capsule").
- [ ] No console errors/warnings on load (`list_console_messages`).

### C. Region gate — [AUTO]
- [ ] Heading "Choose a chain"; subtitle "Pick where your notes live. You can switch anytime."
- [ ] A grid of chains renders from `networks.ts`; testnets are tagged and span the full row.
- [ ] Clicking a chain enters it; the masthead then shows a "Writing on <chain>" bar with a "switch" link.
- [ ] "switch" returns to the gate.

### D. Onboarding — [GATED: UI/validation only without a real passkey]
- [ ] **Step 1 (Identity):** "Create your identity" + "Create a passkey" / "I already have one". The Apple-OS compatibility note is visible on the encryption step.
- [ ] Clicking "Create a passkey" reveals the name field ("Pick a name", placeholder "e.g. satoshi"); empty name keeps the Create button disabled.
- [ ] **Step 2 (Encryption):** after identity, "Unlock your encryption" + "Start writing". (Deriving the key needs a real biometric — GATED.)
- [ ] Error copy is friendly (no raw jargon): trigger paths should show e.g. "This browser can't create a passkey…", never "WebAuthn"/"PRF" raw.

### E. Write & seal — [GATED: needs funded passkey wallet + biometric]
- [ ] One writing sheet: a ruled-paper `<textarea>` (placeholder "Write it here. Only you will ever read it again.").
- [ ] **No lock toggle / no date picker** anywhere on the sheet.
- [ ] Footer meta: "On <chain> · <n> bytes · one note every 12h"; byte counter turns red past the limit; the fee (0.001 native) is shown; primary button "Seal it".
- [ ] Sealing flow: confirm-with-passkey → encrypting → on-chain; success toast "Sealed. It's yours forever." with a "View transaction" link.
- [ ] **12h cooldown:** a second seal on the same chain within 12h is blocked up-front with a friendly message ("One note per chain every 12 hours. You can write again …") — and it must fail *before* prompting a passkey.
- [ ] Empty balance → the **funding modal** (sponsor / self-fund with QR), not a dead-end error.

### F. Past notes (timeline) — [GATED]
- [ ] "Write" / "Past notes" tabs switch one view at a time.
- [ ] "Show my notes" loads the timeline; each note shows its date + decrypted text. Loading should feel quick (count + first page fetch run in parallel).
- [ ] Newest/Oldest sort toggle reloads correctly; "Show older (N more)" paginates and appends.
- [ ] A note that can't be decrypted shows the friendly "This note couldn't be decrypted" row (not a crash).
- [ ] Empty state: "Nothing sealed on this chain yet. / Your first note is waiting."

### G. Settings / theme / responsive — [AUTO]
- [ ] Settings modal opens; the panel is tinted to the seal (gold) palette, not the default green (the modal portals to `<body>`, so the page redefines `--seal` in `.capsule-settings`).
- [ ] Light & dark both legible (token-driven; no hardcoded `rgba(255,255,255,x)` showing as invisible in light).
- [ ] Mobile 390×844: sheet footer stacks, seal button full-width, no overflow.

### H. i18n sweep — [AUTO]
- [ ] For each of the 15 locales: set the cookie, re-navigate, confirm the masthead + gate render translated text (no visible raw keys), brand is "Seal" (or 封存 for zh family).

---

## 2. Notes on scope

- **Full write/seal/timeline needs a real funded passkey Safe + a human biometric tap** — exactly like the camera-gated parts of wallet-generator. Don't report those as FAIL when blocked by the authenticator; report them as GATED and verify the surrounding UI/validation/error copy instead.
- The seal transaction is an **ERC-4337 UserOperation** (estimate → sign → submit → wait for inclusion). The few-second wait is the bundler landing it on-chain, not the encryption.
