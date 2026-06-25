<script lang="ts">
	import { ExternalLink, ShieldCheck, Code } from '@lucide/svelte';
	import { t } from '$lib/i18n';

	/**
	 * Sponsor promo card — a single, tasteful in-content recommendation.
	 *
	 * Currently advertising **Vela Wallet** (getvela.app), built by the same
	 * author as BiuBiu Tools, so it reads as a first-party recommendation
	 * (trust transfer) rather than a random banner. Highly contextual on a chain
	 * detail page: the visitor is here to connect a chain to a wallet.
	 *
	 * ── To swap the advertiser ──────────────────────────────────────────────
	 *  1. Edit PROMO below: the click-through link + brand mark colours/logo.
	 *  2. Edit the `chains.promo.*` copy in
	 *     src/messages/<locale>/chains/[chainID].json (all locales).
	 *  The component itself never needs to change.
	 */
	const PROMO = {
		href: 'https://sndra.link/r/Zhxrmi',
		// Real Vela logo (sailboat), copied from getvela.app into /static/promo.
		logoWebp: '/promo/vela.webp',
		logoPng: '/promo/vela.png',
		// Vela brand accent (#e8572a) — fixed on purpose: brand colours stay
		// on-brand in both light and dark themes. Matches getvela.app's --accent.
		brandFrom: '#e8572a',
		brandTo: '#f56a3d'
	};
</script>

<a
	class="promo"
	href={PROMO.href}
	target="_blank"
	rel="noopener noreferrer sponsored"
	aria-label={`${t('chains.promo.title')} — ${t('chains.promo.cta')}`}
	style="--brand-from: {PROMO.brandFrom}; --brand-to: {PROMO.brandTo};"
>
	<span class="promo-logo" aria-hidden="true">
		<picture>
			<source srcset={PROMO.logoWebp} type="image/webp" />
			<img src={PROMO.logoPng} alt="" width="48" height="48" loading="lazy" decoding="async" />
		</picture>
	</span>

	<span class="promo-body">
		<span class="promo-eyebrow">
			<span class="promo-eyebrow-text">
				<span class="promo-dot"></span>
				{t('chains.promo.eyebrow')}
			</span>
			<span class="promo-ad">{t('chains.promo.ad')}</span>
		</span>
		<span class="promo-title">{t('chains.promo.title')}</span>
		<span class="promo-desc">{t('chains.promo.desc')}</span>
		<span class="promo-feats">
			<span class="promo-feat"><ShieldCheck size={12} />{t('chains.promo.feature1')}</span>
			<span class="promo-feat"><Code size={12} />{t('chains.promo.feature2')}</span>
		</span>
	</span>

	<span class="promo-cta">
		{t('chains.promo.cta')}
		<ExternalLink size={15} />
	</span>
</a>

<style>
	.promo {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		flex-wrap: wrap;
		padding: var(--space-5);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		text-decoration: none;
		transition:
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing),
			transform var(--motion-fast) var(--easing);
	}

	.promo:hover {
		border-color: var(--border-strong);
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}

	/* ── Brand logo tile (real Vela logo carries its own navy background) ── */
	.promo-logo {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		border-radius: var(--radius-md);
		overflow: hidden;
		box-shadow: 0 3px 10px color-mix(in srgb, var(--brand-from) 26%, transparent);
	}

	.promo-logo img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* ── Text body ── */
	.promo-body {
		flex: 1 1 220px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.promo-eyebrow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.promo-eyebrow-text {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		letter-spacing: 0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.promo-dot {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: linear-gradient(145deg, var(--brand-from), var(--brand-to));
	}

	.promo-ad {
		flex-shrink: 0;
		font-size: 10px;
		font-weight: var(--weight-medium);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-faint);
	}

	.promo-title {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		line-height: 1.2;
	}

	.promo-desc {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
	}

	/* ── Trust chips (audited Safe · open-source) ── */
	.promo-feats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}

	.promo-feat {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		white-space: nowrap;
	}

	.promo-feat :global(svg) {
		flex-shrink: 0;
		color: var(--fg-subtle);
	}

	/* ── CTA pill ── */
	.promo-cta {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-full);
		background: linear-gradient(145deg, var(--brand-from), var(--brand-to));
		color: #fff;
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		white-space: nowrap;
		box-shadow: 0 2px 8px color-mix(in srgb, var(--brand-to) 28%, transparent);
		transition:
			transform var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing);
	}

	.promo:hover .promo-cta {
		transform: translateY(-1px);
		box-shadow: 0 4px 14px color-mix(in srgb, var(--brand-to) 38%, transparent);
	}

	/* ── Mobile: CTA drops to its own full-width row ── */
	@media (max-width: 560px) {
		.promo {
			padding: var(--space-4);
		}

		.promo-cta {
			flex: 1 1 100%;
			justify-content: center;
			padding: var(--space-3) var(--space-4);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.promo,
		.promo-cta {
			transition: none;
		}

		.promo:hover,
		.promo:hover .promo-cta {
			transform: none;
		}
	}
</style>
