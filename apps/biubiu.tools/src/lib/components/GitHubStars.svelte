<script lang="ts">
	import { t } from '$lib/i18n';
	import { onMount } from 'svelte';

	let stars = $state<number | null>(null);
	let loading = $state(true);

	const GITHUB_REPO = 'atshelchin/biubiu.tools';
	const CACHE_KEY = 'github_stars_cache';
	const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

	interface CacheData {
		stars: number;
		timestamp: number;
	}

	onMount(async () => {
		// Check cache first
		try {
			const cached = localStorage.getItem(CACHE_KEY);
			if (cached) {
				const data: CacheData = JSON.parse(cached);
				if (Date.now() - data.timestamp < CACHE_DURATION) {
					stars = data.stars;
					loading = false;
					return;
				}
			}
		} catch {
			// Cache read failed, continue to fetch
		}

		// Fetch from GitHub API
		try {
			const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`);
			if (res.ok) {
				const data = await res.json();
				stars = data.stargazers_count;
				// Cache the result
				try {
					localStorage.setItem(
						CACHE_KEY,
						JSON.stringify({ stars: data.stargazers_count, timestamp: Date.now() })
					);
				} catch {
					// Cache write failed, ignore
				}
			}
		} catch {
			// Fetch failed, show fallback
		} finally {
			loading = false;
		}
	});

	function formatStars(count: number): string {
		if (count >= 1000) {
			return (count / 1000).toFixed(1) + 'k';
		}
		return count.toString();
	}
</script>

<a
	href="https://github.com/{GITHUB_REPO}"
	target="_blank"
	rel="noopener noreferrer"
	class="github-badge"
>
	<svg class="github-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
		<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
	</svg>
	<span class="stars-count">
		{#if loading}
			-
		{:else if stars !== null}
			{formatStars(stars)}
		{:else}
			-
		{/if}
	</span>
	<span class="stars-label">{t('badge.stars')}</span>
</a>

<style>
	.github-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		text-decoration: none;
		transition: all var(--motion-fast) var(--easing);
	}

	.github-badge:hover {
		border-color: var(--border-strong);
		color: var(--fg-base);
		transform: translateY(-2px);
	}

	.github-icon {
		flex-shrink: 0;
	}

	.stars-count {
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	.stars-label {
		color: var(--fg-subtle);
	}
</style>
