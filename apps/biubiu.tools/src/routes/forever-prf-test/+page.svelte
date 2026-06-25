<script lang="ts">
	// Developer probe for WebAuthn PRF — the key source for Capsule's client-side encryption.
	// Purpose: test PRF *consistency*. Does the SAME passkey yield the SAME 32-byte PRF output
	//   (1) across evaluations, (2) across a browser restart, and — the one that actually bit us —
	//   (3) across DIFFERENT DEVICES / authenticators (macOS vs Windows vs Android vs a hardware key)?
	//
	// The salt below is IDENTICAL to the live Capsule app (crypto/prf.ts), so a hex shown here is
	// exactly the PRF input the real app derives its key from for that passkey.
	//
	// CROSS-DEVICE RECIPE (the important test):
	//   Device A: "Evaluate (pick a passkey)" → pick your passkey → Copy the hex.
	//   Device B: paste that hex into "Expected hex", then "Evaluate (pick a passkey)" and choose the
	//             SAME synced passkey → the banner says MATCH (portable) or MISMATCH (not portable).
	//   • A 1Password/Bitwarden or hardware-key passkey should MATCH on every OS.
	//   • An iCloud passkey matches on Apple devices, but MISMATCHes / fails on Google / Windows.

	import { onMount } from 'svelte';

	const LS_CRED = 'forever.prf.test.credentialId';
	const LS_PRF = 'forever.prf.test.firstHex';
	const LS_NAME = 'forever.prf.test.name';
	const LS_EXPECT = 'forever.prf.test.expectedHex';
	// SAME salt as the live Capsule app (crypto/prf.ts). Keep in sync — do not change.
	const SALT_TEXT = 'forever.biubiu.tools/prf/v1';
	const SALT = new TextEncoder().encode(SALT_TEXT) as unknown as BufferSource;

	let supported = $state<boolean | null>(null);
	let log = $state<string[]>([]);
	let name = $state('capsule-test'); // editable: the passkey name (find the same one per device)
	let credentialId = $state<string>(''); // editable: paste a credentialId from another device
	let expectedHex = $state<string>(''); // editable: paste a hex from device A to compare
	let lastHex = $state<string | null>(null);
	let lastCredUsed = $state<string | null>(null);
	let prfEnabledAtCreate = $state<boolean | null>(null);
	let sessionHexes = $state<string[]>([]);
	let storedHex = $state<string | null>(null);
	let busy = $state(false);

	function say(msg: string) {
		log = [...log, `${new Date().toLocaleTimeString()}  ${msg}`];
	}
	function persist() {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(LS_NAME, name);
		localStorage.setItem(LS_EXPECT, expectedHex);
		if (credentialId) localStorage.setItem(LS_CRED, credentialId);
	}

	// ---- encoding helpers ----
	function bufToHex(buf: ArrayBuffer): string {
		return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
	}
	function toB64url(buf: ArrayBuffer): string {
		let s = '';
		for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
		return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}
	function fromB64url(s: string): BufferSource {
		s = s.replace(/-/g, '+').replace(/_/g, '/');
		while (s.length % 4) s += '=';
		const bin = atob(s);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out as unknown as BufferSource;
	}
	function rand(n: number): BufferSource {
		const a = new Uint8Array(n);
		crypto.getRandomValues(a);
		return a as unknown as BufferSource;
	}

	onMount(() => {
		supported = typeof PublicKeyCredential !== 'undefined';
		credentialId = localStorage.getItem(LS_CRED) ?? '';
		storedHex = localStorage.getItem(LS_PRF);
		name = localStorage.getItem(LS_NAME) ?? 'capsule-test';
		expectedHex = localStorage.getItem(LS_EXPECT) ?? '';
		say(`PublicKeyCredential ${supported ? 'available' : 'NOT available'} on this browser.`);
		say(`Salt = "${SALT_TEXT}" (same as the live Capsule app).`);
		if (credentialId) say(`Remembered a credentialId on this device: ${credentialId.slice(0, 16)}…`);
	});

	// Result handling shared by create / evaluate. Centralises the two comparisons:
	//  • Expected hex  → cross-DEVICE portability (the real question)
	//  • Stored hex    → same-device cross-session stability
	function handleHex(hex: string, usedId: string, source: string) {
		lastHex = hex;
		lastCredUsed = usedId;
		credentialId = usedId; // so it can be copied / reused as a pinned target
		sessionHexes = [...sessionHexes, hex];
		say(`✅ PRF (${hex.length / 2} bytes) via ${source}, cred ${usedId.slice(0, 12)}… → ${hex}`);

		const exp = expectedHex.trim().toLowerCase();
		if (exp) {
			if (exp === hex) say('🎯 MATCHES "Expected hex" → SAME PRF on this authenticator → portable here.');
			else say('🚨 DIFFERS from "Expected hex" → different PRF here → NOT portable on this authenticator.');
		}

		if (!storedHex) {
			storedHex = hex;
			localStorage.setItem(LS_PRF, hex);
			say('Saved as this device’s baseline — reload / restart and evaluate to test same-device stability.');
		} else if (storedHex === hex) {
			say('🎯 Matches this device’s earlier baseline — stable across sessions here.');
		} else {
			say('🚨 Differs from this device’s earlier baseline — unstable even on the same device.');
		}
		persist();
	}

	async function createPasskey() {
		busy = true;
		try {
			const nm = name.trim() || 'capsule-test';
			say(`Creating passkey "${nm}" with prf… (approve, and choose where to save it: iCloud / Google / 1Password / security key)`);
			const cred = (await navigator.credentials.create({
				publicKey: {
					challenge: rand(32),
					rp: { name: 'Capsule PRF Probe', id: location.hostname },
					user: { id: rand(16), name: nm, displayName: nm },
					pubKeyCredParams: [
						{ type: 'public-key', alg: -7 }, // ES256 / P-256
						{ type: 'public-key', alg: -257 } // RS256 fallback
					],
					authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
					// Enable AND try to evaluate in one ceremony (one prompt when supported).
					extensions: { prf: { eval: { first: SALT } } } as AuthenticationExtensionsClientInputs
				}
			})) as PublicKeyCredential;

			const id = toB64url(cred.rawId);
			const ext = cred.getClientExtensionResults() as {
				prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
			};
			prfEnabledAtCreate = ext.prf?.enabled ?? null;
			say(`Created "${nm}". id ${id.slice(0, 16)}…  prf.enabled = ${JSON.stringify(prfEnabledAtCreate)}` +
				(prfEnabledAtCreate === false ? '  ⚠️ authenticator reports PRF NOT supported.' : ''));

			const first = ext.prf?.results?.first;
			if (first) handleHex(bufToHex(first), id, 'create');
			else {
				credentialId = id;
				persist();
				say('No PRF value at create() — some authenticators only return it on get(). Use "Evaluate (this id)".');
			}
		} catch (e) {
			say(`❌ create() failed: ${(e as Error).message}`);
		} finally {
			busy = false;
		}
	}

	async function evalWith(allowCredentials: PublicKeyCredentialDescriptor[], source: string) {
		busy = true;
		try {
			say(
				source === 'pick'
					? 'Evaluating PRF — pick a passkey (choose the SAME synced one on every device)…'
					: `Evaluating PRF on credentialId ${credentialId.slice(0, 16)}…`
			);
			const assertion = (await navigator.credentials.get({
				publicKey: {
					challenge: rand(32),
					allowCredentials,
					userVerification: 'required',
					extensions: { prf: { eval: { first: SALT } } } as AuthenticationExtensionsClientInputs
				}
			})) as PublicKeyCredential;

			const usedId = toB64url(assertion.rawId);
			const first = (
				assertion.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }
			).prf?.results?.first;
			if (!first) {
				say('❌ No prf.results.first returned — this authenticator/browser/transport did not give PRF.');
				return;
			}
			handleHex(bufToHex(first), usedId, source);
		} catch (e) {
			say(`❌ get() failed: ${(e as Error).message}`);
		} finally {
			busy = false;
		}
	}

	function evaluatePinned() {
		const id = credentialId.trim();
		if (!id) {
			say('Paste a credentialId (or create / pick one) first.');
			return;
		}
		let allow: PublicKeyCredentialDescriptor[];
		try {
			allow = [{ type: 'public-key', id: fromB64url(id) }];
		} catch {
			say('❌ credentialId is not valid base64url.');
			return;
		}
		void evalWith(allow, 'pinned');
	}
	function evaluateDiscoverable() {
		void evalWith([], 'pick'); // empty list ⇒ the platform shows a picker of ANY available passkey
	}

	async function copy(text: string | null, label: string) {
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			say(`Copied ${label}.`);
		} catch {
			say(`Copy failed — select the ${label} and copy manually.`);
		}
	}

	function reset() {
		localStorage.removeItem(LS_CRED);
		localStorage.removeItem(LS_PRF);
		credentialId = '';
		storedHex = null;
		lastHex = null;
		lastCredUsed = null;
		sessionHexes = [];
		prfEnabledAtCreate = null;
		log = [];
		say('Cleared remembered credentialId + baseline (kept name & expected hex).');
	}

	const allSessionMatch = $derived(
		sessionHexes.length >= 2 && sessionHexes.every((h) => h === sessionHexes[0])
	);
	const verdict = $derived(
		lastHex && expectedHex.trim()
			? expectedHex.trim().toLowerCase() === lastHex
				? 'match'
				: 'mismatch'
			: null
	);
</script>

<svelte:head><title>Capsule · PRF consistency probe</title></svelte:head>

<main>
	<h1>Capsule — PRF consistency probe</h1>
	<p class="sub">
		Tests whether a passkey yields the <strong>same 32-byte PRF output</strong> across evaluations,
		restarts, and — the one that matters — <strong>different devices</strong>. Same salt as the live
		Capsule app, so the hex here is exactly what the app would key from.
	</p>

	{#if verdict}
		<div class="banner {verdict}">
			{verdict === 'match'
				? '🎯 MATCH — this authenticator reproduces the expected PRF. Portable here.'
				: '🚨 MISMATCH — different PRF on this authenticator. A capsule sealed elsewhere will NOT decrypt here.'}
		</div>
	{/if}

	<div class="card">
		<div class="row"><span>Browser support</span>
			<b class={supported ? 'ok' : 'bad'}>{supported == null ? '…' : supported ? 'PublicKeyCredential ✓' : 'unsupported ✗'}</b>
		</div>
		<div class="row"><span>prf.enabled @ create</span>
			<b class={prfEnabledAtCreate === false ? 'bad' : prfEnabledAtCreate ? 'ok' : ''}>{prfEnabledAtCreate == null ? '—' : String(prfEnabledAtCreate)}</b>
		</div>
		<div class="row"><span>This-session evaluations</span>
			<b class={sessionHexes.length >= 2 ? (allSessionMatch ? 'ok' : 'bad') : ''}>
				{sessionHexes.length}{sessionHexes.length >= 2 ? (allSessionMatch ? ' · all match ✓' : ' · MISMATCH ✗') : ''}
			</b>
		</div>
	</div>

	<!-- Inputs: name (find the same passkey per device), credentialId (pin a specific one),
	     expected hex (carry from device A to compare on device B). -->
	<div class="field">
		<label for="nm">Passkey name <small>(shown in your passkey manager; use the same on each device)</small></label>
		<input id="nm" bind:value={name} oninput={persist} placeholder="capsule-test" autocomplete="off" />
	</div>

	<div class="field">
		<label for="cid">credentialId <small>(base64url — auto-filled after create/pick; paste one from another device to pin it)</small></label>
		<div class="inline">
			<input id="cid" bind:value={credentialId} oninput={persist} placeholder="— none —" autocomplete="off" spellcheck="false" />
			<button class="ghost sm" onclick={() => copy(credentialId, 'credentialId')} disabled={!credentialId}>Copy</button>
		</div>
	</div>

	<div class="field">
		<label for="exp">Expected hex <small>(paste the PRF hex from device A; evaluating on device B shows MATCH / MISMATCH)</small></label>
		<input id="exp" bind:value={expectedHex} oninput={persist} placeholder="64 hex chars from another device" autocomplete="off" spellcheck="false" />
	</div>

	<div class="actions">
		<button onclick={createPasskey} disabled={busy || supported === false}>Create new passkey</button>
		<button onclick={evaluateDiscoverable} disabled={busy || supported === false}>Evaluate (pick a passkey)</button>
		<button onclick={evaluatePinned} disabled={busy || !credentialId.trim()}>Evaluate (this id)</button>
		<button class="ghost" onclick={reset} disabled={busy}>Reset</button>
	</div>

	{#if lastHex}
		<div class="result">
			<div class="result-head">
				<span>Last PRF output{lastCredUsed ? ` · cred ${lastCredUsed.slice(0, 12)}…` : ''}</span>
				<button class="ghost sm" onclick={() => copy(lastHex, 'PRF hex')}>Copy hex</button>
			</div>
			<code class="hex">{lastHex}</code>
		</div>
	{/if}

	<p class="hint">
		<strong>Same-device stability:</strong> Evaluate twice, reload, restart the browser — all must match.<br />
		<strong>Cross-device portability:</strong> on device A pick your passkey → Copy hex; on device B paste it into
		<em>Expected hex</em>, then “Evaluate (pick a passkey)” and choose the same synced passkey. A 1Password / Bitwarden
		or hardware-key passkey should MATCH everywhere; an iCloud passkey will MISMATCH on Google / Windows.
	</p>

	<pre class="log">{log.join('\n')}</pre>
</main>

<style>
	main { max-width: 720px; margin: 0 auto; padding: 48px 20px 80px; }
	h1 { font-weight: 800; letter-spacing: -0.02em; font-size: 1.6rem; }
	.sub { color: var(--fg-muted, #888); line-height: 1.6; margin-bottom: 20px; }
	.banner {
		border-radius: 12px; padding: 12px 16px; margin-bottom: 18px; font-size: 0.9rem; font-weight: 600;
		border: 1px solid transparent;
	}
	.banner.match { color: #2f8e6b; background: rgba(54, 160, 122, 0.12); border-color: rgba(54, 160, 122, 0.35); }
	.banner.mismatch { color: #c9483d; background: rgba(210, 86, 75, 0.12); border-color: rgba(210, 86, 75, 0.35); }
	.card {
		background: var(--bg-elevated, rgba(255, 255, 255, 0.05));
		border: 1px solid var(--border-base, rgba(255, 255, 255, 0.08));
		border-radius: 14px; padding: 14px 18px; margin-bottom: 18px;
		box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.15));
	}
	.row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; font-size: 0.9rem; }
	.row + .row { border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.05)); }
	.row span { color: var(--fg-muted, #888); }
	.row b { font-family: ui-monospace, monospace; font-weight: 600; }
	.ok { color: #36a07a; }
	.bad { color: #d2564b; }
	.field { margin-bottom: 12px; }
	.field label { display: block; font-size: 0.82rem; margin-bottom: 5px; color: var(--fg-base, #ccc); }
	.field label small { color: var(--fg-muted, #888); font-weight: 400; }
	.inline { display: flex; gap: 8px; }
	input {
		width: 100%; box-sizing: border-box; padding: 9px 12px; border-radius: 10px;
		border: 1px solid var(--border-base, rgba(255, 255, 255, 0.12));
		background: var(--bg-sunken, rgba(0, 0, 0, 0.2)); color: inherit;
		font-size: 0.85rem; font-family: ui-monospace, monospace;
	}
	input:focus { outline: none; border-color: var(--accent, #36a07a); }
	.actions { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0 14px; }
	button {
		padding: 10px 16px; border-radius: 10px; border: 1px solid var(--border-base, rgba(255, 255, 255, 0.12));
		background: var(--bg-raised, rgba(255, 255, 255, 0.06)); color: inherit; font-size: 0.9rem; cursor: pointer;
		transition: transform 0.12s ease, background 0.12s ease;
	}
	button:hover:not(:disabled) { transform: translateY(-1px); }
	button:disabled { opacity: 0.4; cursor: not-allowed; }
	button.ghost { background: transparent; }
	button.sm { padding: 9px 12px; font-size: 0.8rem; white-space: nowrap; }
	.result {
		background: var(--bg-sunken, rgba(0, 0, 0, 0.25)); border: 1px solid var(--border-base, rgba(255, 255, 255, 0.08));
		border-radius: 12px; padding: 12px 14px; margin-bottom: 14px;
	}
	.result-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; font-size: 0.8rem; color: var(--fg-muted, #888); }
	.hex { display: block; font-family: ui-monospace, monospace; font-size: 0.82rem; line-height: 1.5; word-break: break-all; color: var(--fg-base, #ddd); }
	.hint { color: var(--fg-muted, #888); font-size: 0.82rem; line-height: 1.7; margin-bottom: 16px; }
	.log {
		background: var(--bg-sunken, rgba(0, 0, 0, 0.25)); border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
		border-radius: 12px; padding: 14px; font-size: 0.78rem; line-height: 1.55;
		white-space: pre-wrap; word-break: break-all; min-height: 120px; color: var(--fg-base, #ddd);
	}
</style>
