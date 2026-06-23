<script lang="ts">
	// Phase 0a spike — WebAuthn PRF probe for 《致未来 · Forever》.
	// Goal: confirm a platform authenticator (Touch ID / Windows Hello / Android) can
	//   (1) create a credential WITH the prf extension,
	//   (2) return a 32-byte PRF output for a fixed salt,
	//   (3) return the SAME bytes across separate get() calls AND across a page reload /
	//       browser restart (this is what makes the encryption key reproducible -> durable).
	// This page uses raw WebAuthn only (no app deps). It is a developer test page.

	import { onMount } from 'svelte';

	const LS_CRED = 'forever.prf.test.credentialId';
	const LS_PRF = 'forever.prf.test.firstHex';
	// Fixed application salt. The exact bytes don't matter, only that they're constant.
	const SALT = new TextEncoder().encode('forever.biubiu.tools/prf/v1') as unknown as BufferSource;

	let supported = $state<boolean | null>(null);
	let log = $state<string[]>([]);
	let credentialId = $state<string | null>(null); // base64url
	let prfEnabledAtCreate = $state<boolean | null>(null);
	let sessionHexes = $state<string[]>([]);
	let storedHex = $state<string | null>(null);
	let busy = $state(false);

	function say(msg: string) {
		log = [...log, `${new Date().toLocaleTimeString()}  ${msg}`];
	}

	// ---- encoding helpers ----
	function bufToHex(buf: ArrayBuffer): string {
		return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
	}
	function toB64url(buf: ArrayBuffer): string {
		let s = '';
		const bytes = new Uint8Array(buf);
		for (const b of bytes) s += String.fromCharCode(b);
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
		credentialId = localStorage.getItem(LS_CRED);
		storedHex = localStorage.getItem(LS_PRF);
		say(`PublicKeyCredential ${supported ? 'available' : 'NOT available'} on this browser.`);
		if (credentialId) say(`Found a previously-created test passkey (id ${credentialId.slice(0, 12)}…).`);
		if (storedHex) say(`Found PRF output from an earlier session: ${storedHex.slice(0, 16)}…`);
	});

	async function createPasskey() {
		busy = true;
		try {
			say('Creating a passkey WITH the prf extension… (approve the prompt)');
			const cred = (await navigator.credentials.create({
				publicKey: {
					challenge: rand(32),
					rp: { name: 'Forever PRF Test', id: location.hostname },
					user: { id: rand(16), name: 'forever-prf-test', displayName: 'Forever PRF Test' },
					pubKeyCredParams: [
						{ type: 'public-key', alg: -7 }, // ES256 / P-256
						{ type: 'public-key', alg: -257 } // RS256 fallback
					],
					authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
					extensions: { prf: {} } as AuthenticationExtensionsClientInputs
				}
			})) as PublicKeyCredential;

			credentialId = toB64url(cred.rawId);
			localStorage.setItem(LS_CRED, credentialId);

			// A new passkey has its OWN PRF secret, so any previous baseline is no longer
			// comparable. Clear it, otherwise the next Evaluate falsely reports "NOT stable".
			localStorage.removeItem(LS_PRF);
			storedHex = null;
			sessionHexes = [];
			say('New passkey has its own PRF secret — cleared the previous baseline.');

			const ext = cred.getClientExtensionResults() as { prf?: { enabled?: boolean } };
			prfEnabledAtCreate = ext.prf?.enabled ?? null;
			say(
				`Passkey created. clientExtensionResults.prf.enabled = ${JSON.stringify(prfEnabledAtCreate)}` +
					(prfEnabledAtCreate === false
						? '  ⚠️ authenticator reports PRF NOT supported.'
						: prfEnabledAtCreate == null
							? '  (no enabled flag — try Evaluate; some authenticators only report on get())'
							: '  ✅ PRF supported.')
			);
		} catch (e) {
			say(`❌ create() failed: ${(e as Error).message}`);
		} finally {
			busy = false;
		}
	}

	async function evaluatePrf() {
		busy = true;
		try {
			if (!credentialId) {
				say('No test passkey yet — create one first.');
				return;
			}
			say('Evaluating PRF via get()… (approve the prompt)');
			const assertion = (await navigator.credentials.get({
				publicKey: {
					challenge: rand(32),
					allowCredentials: [{ type: 'public-key', id: fromB64url(credentialId) }],
					userVerification: 'required',
					extensions: {
						prf: { eval: { first: SALT } }
					} as AuthenticationExtensionsClientInputs
				}
			})) as PublicKeyCredential;

			const results = (
				assertion.getClientExtensionResults() as {
					prf?: { results?: { first?: ArrayBuffer } };
				}
			).prf?.results?.first;

			if (!results) {
				say('❌ No prf.results.first returned — this authenticator/browser does not support PRF eval.');
				return;
			}
			const hex = bufToHex(results);
			say(`✅ PRF output (${results.byteLength} bytes): ${hex}`);
			sessionHexes = [...sessionHexes, hex];

			// Persist the first-ever value for cross-restart comparison.
			if (!storedHex) {
				storedHex = hex;
				localStorage.setItem(LS_PRF, hex);
				say('Stored this value for cross-session comparison. Reload / restart the browser and Evaluate again.');
			} else if (storedHex === hex) {
				say('🎯 MATCHES the stored value from an earlier evaluation/session — key is reproducible.');
			} else {
				say('🚨 DIFFERS from the stored value — PRF output is NOT stable. Key would be unrecoverable.');
			}
		} catch (e) {
			say(`❌ get() failed: ${(e as Error).message}`);
		} finally {
			busy = false;
		}
	}

	function reset() {
		localStorage.removeItem(LS_CRED);
		localStorage.removeItem(LS_PRF);
		credentialId = null;
		storedHex = null;
		sessionHexes = [];
		prfEnabledAtCreate = null;
		log = [];
		say('Cleared stored test passkey + PRF value.');
	}

	const allSessionMatch = $derived(
		sessionHexes.length >= 2 && sessionHexes.every((h) => h === sessionHexes[0])
	);
</script>

<svelte:head><title>Forever · PRF Probe</title></svelte:head>

<main>
	<h1>致未来 · Forever — PRF Probe</h1>
	<p class="sub">
		Developer test for WebAuthn PRF (the key source for client-side encryption). Run on the device
		you'd actually use. Confirm the PRF output is <strong>32 bytes</strong> and
		<strong>identical across evaluations and a browser restart</strong>.
	</p>

	<div class="card">
		<div class="row"><span>Browser support</span>
			<b class={supported ? 'ok' : 'bad'}>{supported == null ? '…' : supported ? 'PublicKeyCredential ✓' : 'unsupported ✗'}</b>
		</div>
		<div class="row"><span>Test passkey</span>
			<b>{credentialId ? credentialId.slice(0, 18) + '…' : '— none —'}</b>
		</div>
		<div class="row"><span>prf.enabled @ create</span>
			<b>{prfEnabledAtCreate == null ? '—' : String(prfEnabledAtCreate)}</b>
		</div>
		<div class="row"><span>Stored value (earlier session)</span>
			<b>{storedHex ? storedHex.slice(0, 18) + '…' : '— none —'}</b>
		</div>
		<div class="row"><span>This session evaluations</span>
			<b class={sessionHexes.length >= 2 ? (allSessionMatch ? 'ok' : 'bad') : ''}>
				{sessionHexes.length} {sessionHexes.length >= 2 ? (allSessionMatch ? '· all match ✓' : '· MISMATCH ✗') : ''}
			</b>
		</div>
	</div>

	<div class="actions">
		<button onclick={createPasskey} disabled={busy || supported === false}>1 · Create PRF passkey</button>
		<button onclick={evaluatePrf} disabled={busy || !credentialId}>2 · Evaluate PRF</button>
		<button class="ghost" onclick={reset} disabled={busy}>Reset</button>
	</div>

	<p class="hint">
		Steps: ① create → ② evaluate (×2 to check session stability) → reload the page and evaluate
		again → quit &amp; reopen the browser and evaluate again. All outputs must match.
	</p>

	<pre class="log">{log.join('\n')}</pre>
</main>

<style>
	main { max-width: 720px; margin: 0 auto; padding: 48px 20px 80px; }
	h1 { font-weight: 800; letter-spacing: -0.02em; font-size: 1.6rem; }
	.sub { color: var(--fg-muted, #888); line-height: 1.6; margin-bottom: 24px; }
	.card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 14px; padding: 16px 18px; margin-bottom: 20px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}
	.row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; font-size: 0.9rem; }
	.row + .row { border-top: 1px solid rgba(255, 255, 255, 0.05); }
	.row span { color: var(--fg-muted, #888); }
	.row b { font-family: ui-monospace, monospace; font-weight: 600; }
	.ok { color: #36a07a; }
	.bad { color: #d2564b; }
	.actions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
	button {
		padding: 10px 16px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.06); color: inherit; font-size: 0.9rem; cursor: pointer;
		transition: transform 0.12s ease, background 0.12s ease;
	}
	button:hover:not(:disabled) { transform: translateY(-1px); background: rgba(255, 255, 255, 0.1); }
	button:disabled { opacity: 0.4; cursor: not-allowed; }
	button.ghost { background: transparent; }
	.hint { color: var(--fg-muted, #888); font-size: 0.82rem; line-height: 1.6; margin-bottom: 16px; }
	.log {
		background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 12px; padding: 14px; font-size: 0.78rem; line-height: 1.55;
		white-space: pre-wrap; word-break: break-all; min-height: 120px; color: var(--fg-base, #ddd);
	}
</style>
