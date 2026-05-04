<script lang="ts">
	import {
		t,
		locale,
		preferences,
		formatNumber,
		formatCurrency,
		formatDate,
		formatDateTime
	} from '$lib/i18n';
	import { fetchExchangeRate } from '$lib/auth/wallet.js';
	import { authStore } from '$lib/auth/auth-store.svelte.js';
	import {
		loadSettings,
		applyTheme,
		applyTextScale,
		type Theme,
		type TextScale,
		type TimeFormat
	} from '$lib/settings';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import DatePicker from '$lib/ui/DatePicker.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { browser } from '$app/environment';
	import { onDestroy, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { fly } from 'svelte/transition';
	import {
		type StrategyEndpoint,
		type StrategyInfo,
		type ValidationProgress,
		FALLBACK_STRATEGIES,
		DEFAULT_VISIBLE_BUILTINS,
		API_HOST,
		generateCustomId,
		normalizeStrategyUrl,
		strategyFetch,
		loadPersistedState,
		savePersistedState,
		discoverStrategies,
		getDiscoveryUrl
	} from '$lib/btc-updown-strategies';
	import {
		type SSEEvent,
		type StrategyProfitData,
	} from '$lib/updown-shared';
	import {
		type FormatterContext,
		fmtProfit as _fmtProfit,
		fmtDateTimeShort as _fmtDateTimeShort,
		formatDuration as _formatDuration,
		todayLocal,
		naturalCompare,
	} from '$lib/updown-shared';
	import {
		fetchStrategyProfitData,
		type ApiFetchOptions,
	} from '$lib/updown-shared';
	import { DashboardStore, type DashboardStoreConfig } from '$lib/updown-shared/stores/dashboard-store.svelte.js';
	import { clock } from '$lib/updown-shared/stores/clock.svelte.js';
	import StatsGrid from '$lib/updown-shared/components/StatsGrid.svelte';
	import HourlyChart from '$lib/updown-shared/components/HourlyChart.svelte';
	import WeekdayChart from '$lib/updown-shared/components/WeekdayChart.svelte';
	import RoundsHistory from '$lib/updown-shared/components/RoundsHistory.svelte';
	import LiveFeed from '$lib/updown-shared/components/LiveFeed.svelte';
	import AddStrategyModal from '$lib/updown-shared/components/AddStrategyModal.svelte';
	import StrategyControlPanel from '$lib/updown-shared/components/StrategyControlPanel.svelte';
	import ConfiguratorDrawer from '$lib/updown-shared/configurator/ConfiguratorDrawer.svelte';
	import type { StrategyConfigV2 } from '$lib/updown-shared/configurator/types.js';
	import { EndpointStore } from '$lib/updown-shared/auth/endpoint-store.svelte.js';
	import {
		fetchEngineStatus,
		startInstance,
		stopInstance,
		pauseInstance,
		type StrategyInstance,
	} from '$lib/updown-shared/auth/engine-client.js';
	import type { ManagedEndpoint } from '$lib/updown-shared/auth/types.js';

	// --- Exchange rate (USD → user currency) ---
	let exchangeRate = $state(1);

	$effect(() => {
		const cur = preferences.currency;
		fetchExchangeRate(cur).then(r => { exchangeRate = r; });
	});

	// --- Formatter context (bridges i18n reactive state to pure functions) ---

	function getFormatterCtx(): FormatterContext {
		return {
			formatNumber,
			formatCurrency,
			formatDate,
			formatDateTime,
			timezone: preferences.timezone,
			timeFormat,
			exchangeRate,
		};
	}

	// Convenience wrappers (bind formatter context)
	const fmtProfit = (value: number) => _fmtProfit(getFormatterCtx(), value);
	const fmtDateTimeShort = (ts: string) => _fmtDateTimeShort(getFormatterCtx(), ts);
	const formatDuration = (startTime: string, _now: number) => _formatDuration(startTime, _now);

	function apiUrl(path: string): string {
		return `${activeStrategy.baseUrl}${path}`;
	}

	function getFetchFn(): (url: string, init?: RequestInit) => Promise<Response> {
		return activeStrategy.type === 'custom'
			? strategyFetch
			: (url: string, init?: RequestInit) => fetch(url, { cache: 'no-store', ...init });
	}

	function getApiOpts(): ApiFetchOptions {
		return { baseUrl: activeStrategy.baseUrl, fetchFn: getFetchFn() };
	}

	// Hoisted: must be declared before getStoreConfig() which references them eagerly
	let activeStrategyId = $state('builtin:v1');
	const INSTANCE_PREFIX = 'instance::';
	const endpointStore = new EndpointStore();

	function isInstanceId(id: string): boolean {
		return id.startsWith(INSTANCE_PREFIX);
	}

	function parseInstanceId(id: string): { epUrl: string; instanceId: string } | null {
		if (!id.startsWith(INSTANCE_PREFIX)) return null;
		const rest = id.slice(INSTANCE_PREFIX.length);
		const sep = rest.indexOf('::');
		if (sep < 0) return null;
		return { epUrl: rest.slice(0, sep), instanceId: rest.slice(sep + 2) };
	}

	function makeInstanceId(epUrl: string, instanceId: string): string {
		return `${INSTANCE_PREFIX}${epUrl}::${instanceId}`;
	}

	/** Find the ManagedEndpoint object by URL */
	function findEndpoint(epUrl: string): ManagedEndpoint | undefined {
		return endpointStore.endpoints.find((ep) => ep.url === epUrl);
	}

	/** Create a fetch function that injects auth headers for a managed endpoint */
	function createEndpointFetchFn(ep: ManagedEndpoint): (url: string, init?: RequestInit) => Promise<Response> {
		return (url: string, init?: RequestInit) =>
			fetch(url, {
				cache: 'no-store',
				...init,
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${ep.token}`,
					'X-Client-Id': ep.clientId,
					...(init?.headers ?? {})
				}
			});
	}

	function getStoreConfig(): DashboardStoreConfig {
		// Instance-based strategy: route through engine data APIs
		const parsed = parseInstanceId(activeStrategyId);
		if (parsed) {
			const ep = findEndpoint(parsed.epUrl);
			if (ep) {
				const fetchFn = createEndpointFetchFn(ep);
				const baseUrl = `${ep.url}/api/engine/${parsed.instanceId}`;
				// SSE: EventSource can't send custom headers, pass auth via query params
				const sseUrl = `${baseUrl}/sse/live?token=${encodeURIComponent(ep.token)}&clientId=${encodeURIComponent(ep.clientId)}`;
				return {
					getApiOpts: () => ({ baseUrl, fetchFn }),
					getSseUrl: () => sseUrl,
					isCustomStrategy: () => false, // not proxied — direct EventSource with query auth
				};
			}
		}
		// Regular strategy
		return {
			getApiOpts,
			getSseUrl: () => apiUrl('/sse/live'),
			isCustomStrategy: () => activeStrategy.type === 'custom',
		};
	}

	const store = new DashboardStore(getStoreConfig());

	// --- Endpoint Management (managed mode) ---
	const managedEndpoint = $derived(endpointStore.activeEndpoint);
	/** The endpoint for the currently selected instance (if any) */
	const selectedInstanceEndpoint = $derived.by(() => {
		const parsed = parseInstanceId(activeStrategyId);
		if (!parsed) return null;
		return findEndpoint(parsed.epUrl) ?? null;
	});
	/** Show management panel when an instance-based strategy is active OR when an endpoint is explicitly active */
	const showManagementEndpoint = $derived(selectedInstanceEndpoint ?? managedEndpoint);

	// Instance action state
	let instanceActionLoading = $state<string | null>(null);
	let instanceActionError = $state('');

	// Configurator: when set, main area shows configurator instead of data panels
	let configuratorEndpoint = $state<ManagedEndpoint | null>(null);
	let configuratorActive = $derived(configuratorEndpoint !== null);

	async function handleConfiguratorSave(config: StrategyConfigV2, label: string) {
		if (!configuratorEndpoint) return;
		const ep = configuratorEndpoint;
		try {
			// Map StrategyConfigV2 to InstanceOverrides + createInstance
			const { createInstance: create } = await import('$lib/updown-shared/auth/engine-client.js');
			const overrides: Record<string, unknown> = {
				entryAmount: config.entry.amount,
				priceMin: 0.01,
				priceMax: config.entry.maxBuyPrice,
				hedgingEnabled: config.hedge.enabled,
				hedgeLimitPrice: config.hedge.limitPrice,
				hedgeShares: config.hedge.shares,
				hedgeSellThreshold: config.hedge.sellThreshold,
			};
			if (config.entry.method === 'swing_limit' && config.entry.swingTargetPrice != null) {
				overrides.volatileSwingBuyPrice = config.entry.swingTargetPrice;
			}
			for (const rule of config.exit) {
				if (rule.type === 'take_profit') overrides.volatileSwingTakeProfitPct = rule.pct;
				if (rule.type === 'stop_loss') overrides.volatileSwingStopLossPrice = rule.price;
			}
			// Use first available base strategy
			const { fetchBaseStrategies } = await import('$lib/updown-shared/auth/engine-client.js');
			const { strategies } = await fetchBaseStrategies(ep);
			const baseId = strategies[0]?.id ?? 'v1';
			await create(ep, { baseStrategyId: baseId, label, overrides });
			configuratorEndpoint = null;
			await refreshEndpointInstances();
			await fetchAllStrategyProfits();
		} catch (err) {
			instanceActionError = err instanceof Error ? err.message : 'Failed to create';
		}
	}

	/** Get the current instance's status from the cached instance list */
	const activeInstanceStatus = $derived.by(() => {
		const parsed = parseInstanceId(activeStrategyId);
		if (!parsed) return null;
		const instances = endpointInstances.get(parsed.epUrl);
		return instances?.find((i) => i.id === parsed.instanceId)?.status ?? null;
	});

	/** Handle instance lifecycle actions from strategy info panel */
	async function handleInstanceAction(action: 'start' | 'stop' | 'pause') {
		const parsed = parseInstanceId(activeStrategyId);
		if (!parsed) return;
		const ep = findEndpoint(parsed.epUrl);
		if (!ep) return;

		instanceActionLoading = action;
		instanceActionError = '';
		try {
			let result: { ok: boolean; error?: string };
			switch (action) {
				case 'start': result = await startInstance(ep, parsed.instanceId); break;
				case 'stop': result = await stopInstance(ep, parsed.instanceId); break;
				case 'pause': result = await pauseInstance(ep, parsed.instanceId); break;
			}
			if (!result.ok) {
				instanceActionError = result.error ?? 'Action failed';
			}
			await refreshEndpointInstances();
			fetchAllStrategyProfits();
		} catch (err) {
			instanceActionError = err instanceof Error ? err.message : 'Action failed';
		} finally {
			instanceActionLoading = null;
		}
	}

	// Endpoint inline state
	let epRegisterError = $state('');

	/**
	 * 解析管理端点链接。
	 * 格式：{baseUrl}/{token}/{clientId}
	 * token = 64 位 hex，clientId = client-开头
	 */
	function parseManagedEndpointUrl(input: string): { baseUrl: string; token: string; clientId: string } | null {
		try {
			const u = new URL(input);
			const segments = u.pathname.split('/').filter(Boolean);
			if (segments.length < 2) return null;
			const clientId = segments[segments.length - 1]!;
			const token = segments[segments.length - 2]!;
			// token: 64 hex chars; clientId: starts with "client-"
			if (!/^[0-9a-f]{64}$/i.test(token)) return null;
			if (!clientId.startsWith('client-')) return null;
			const basePath = segments.slice(0, -2).join('/');
			const baseUrl = `${u.protocol}//${u.host}${basePath ? '/' + basePath : ''}`;
			return { baseUrl, token, clientId };
		} catch {
			return null;
		}
	}

	// --- Instance tracking for live endpoints ---
	/** Map: endpointUrl → instances */
	let endpointInstances = new SvelteMap<string, StrategyInstance[]>();

	/** Fetch instances for all endpoints */
	async function refreshEndpointInstances() {
		for (const ep of endpointStore.endpoints) {
			try {
				const result = await fetchEngineStatus(ep);
				endpointInstances.set(ep.url, result.instances);
			} catch {
				endpointInstances.set(ep.url, []);
			}
		}
	}

	async function handleRegisterPasskeyInline(ep: ManagedEndpoint) {
		epRegisterError = '';
		const result = await endpointStore.registerPasskey(ep.url, ep.clientId);
		if (!result.ok) epRegisterError = result.error;
	}

	// --- Reactive State ---

	let builtinStrategies = $state<StrategyEndpoint[]>(FALLBACK_STRATEGIES);
	let customStrategies = $state<StrategyEndpoint[]>([]);
	let discoveredSiblings = new SvelteMap<string, StrategyEndpoint[]>();
	let visibleDiscoveredIds = $state<Set<string>>(new Set());
	let hiddenStrategyIds = $state<Set<string>>(new Set());
	// All strategies including hidden (for config panels)
	const allKnownStrategies = $derived([
		...builtinStrategies,
		...customStrategies,
		...[...discoveredSiblings.values()].flat().filter((s) => visibleDiscoveredIds.has(s.id))
	]);
	// Only visible strategies (for sidebar display, profits, comparison)
	// Discovered siblings: visibility solely by visibleDiscoveredIds (already filtered in allKnownStrategies)
	// Builtin/custom: visibility by hiddenStrategyIds (opt-out)
	const allRegisteredStrategies = $derived(
		allKnownStrategies.filter((s) => s.type === 'discovered' || !hiddenStrategyIds.has(s.id))
	);
	const activeStrategy = $derived(
		allRegisteredStrategies.find((s) => s.id === activeStrategyId) ??
			allRegisteredStrategies[0] ??
			builtinStrategies[0] ??
			FALLBACK_STRATEGIES[0]
	);
	const isLiveMode = $derived(isInstanceId(activeStrategyId) || store.strategyInfo?.mode === 'live');

	// ─── Strategy Control (pause/resume/params/schedule for live strategies) ───
	let controlExpanded = $state(false);
	let controlStatus = $state<'running' | 'paused' | 'unknown'>('unknown');
	let controlLoading = $state(false);
	let controlError = $state('');
	let controlSuccess = $state('');
	let editEntryAmount = $state<number | null>(null);
	let editMaxBuyPrice = $state<number | null>(null);
	let paramsDirty = $state(false);
	let origEntryAmount = $state<number | null>(null);
	let origMaxBuyPrice = $state<number | null>(null);
	// 入场窗口（多个，基于剩余秒数范围）
	interface EntryWindowEdit { start: number; end: number; }
	let editEntryWindows = $state<EntryWindowEdit[]>([{ start: 300, end: 240 }]);
	let origEntryWindowsJson = $state('');
	// 时区
	const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
	// 调度：7×24 网格（每格 = 1 小时），可拖拽多选
	const DAY_COLS = 7;
	const HOUR_ROWS = 24;
	const DAY_NAMES_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
	// 168 个 boolean（7天 × 24小时），全选初始
	let scheduleGrid = $state<boolean[]>(new Array(DAY_COLS * HOUR_ROWS).fill(true));
	let isDragging = $state(false);
	let dragValue = $state(true); // 拖拽时设置为 true 还是 false
	let dragStartCell = $state(-1);

	/** 从 baseUrl 提取引擎根 URL 和策略 ID */
	function parseEngineUrl(baseUrl: string): { root: string; strategyId: string } | null {
		const m = baseUrl.match(/^(https?:\/\/[^/]+)\/api\/(v\d+)$/);
		if (!m) return null;
		return { root: m[1]!, strategyId: m[2]! };
	}

	/** CORS-safe fetch for engine API (strategyFetch only supports GET) */
	async function engineFetch(url: string, init?: RequestInit): Promise<Response> {
		try {
			return await fetch(url, init);
		} catch {
			// CORS fallback via proxy
			if (!init?.method || init.method === 'GET') {
				return fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
			}
			// POST/PUT via proxy
			return fetch(`/api/proxy?url=${encodeURIComponent(url)}`, init);
		}
	}

	async function fetchControlStatus() {
		const parsed = parseEngineUrl(activeStrategy.baseUrl);
		if (!parsed) return;
		try {
			const res = await engineFetch(`${parsed.root}/api/engine/status`);
			if (!res.ok) return;
			const data = await res.json() as { instances: Array<{ id: string; status: string; overrides: Record<string, unknown> }> };
			const inst = data.instances.find((i: { id: string }) => i.id === parsed.strategyId);
			if (inst) {
				controlStatus = inst.status === 'paused' ? 'paused' : 'running';
				const amt = (inst.overrides.entryAmount as number) ?? 5;
				const price = (inst.overrides.fixedDirectionMaxBuyPrice as number)
					?? (inst.overrides.prevCandleMaxBuyPrice as number)
					?? (inst.overrides.priceMax as number)
					?? 0.45;
				editEntryAmount = amt;
				editMaxBuyPrice = price;
				origEntryAmount = amt;
				origMaxBuyPrice = price;
				// 入场窗口
				const ew = inst.overrides.entryWindows as Array<{ remainingSecondsStart: number; remainingSecondsEnd: number }> | undefined;
				if (ew?.length) {
					editEntryWindows = ew.map(w => ({ start: w.remainingSecondsStart, end: w.remainingSecondsEnd }));
				}
				origEntryWindowsJson = JSON.stringify(editEntryWindows);
				paramsDirty = false;
			}
		} catch { /* non-critical */ }
	}

	// 策略切换时重新获取控制状态
	let lastFetchedStrategyId = '';
	$effect(() => {
		const sid = activeStrategyId;
		const sidForControl = parseEngineUrl(activeStrategy?.baseUrl)?.strategyId ?? '';
		const needsControl = isLiveMode || sidForControl === 'v80';
		if (needsControl && !isInstanceId(sid) && sid !== lastFetchedStrategyId) {
			lastFetchedStrategyId = sid;
			controlStatus = 'unknown';
			controlError = '';
			controlSuccess = '';
			paramsDirty = false;
			fetchControlStatus();
		}
	});

	// 检测参数修改（含 schedule 网格）
	let origScheduleJson = $state(JSON.stringify(scheduleGrid));
	const scheduleDirty = $derived(JSON.stringify(scheduleGrid) !== origScheduleJson);
	$effect(() => {
		paramsDirty = editEntryAmount !== origEntryAmount || editMaxBuyPrice !== origMaxBuyPrice || JSON.stringify(editEntryWindows) !== origEntryWindowsJson || scheduleDirty;
		if (paramsDirty) controlSuccess = '';
	});

	/** 获取 challenge + WebAuthn 签名 → 返回签名对象 */
	async function getSignedAuth(root: string): Promise<{ signature: Record<string, string> } | null> {
		const chalRes = await engineFetch(`${root}/api/auth/challenge`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}',
		});
		if (!chalRes.ok) { controlError = 'Failed to get challenge'; return null; }
		const { challenge } = await chalRes.json() as { challenge: string };

		const { toBase64url, fromBase64url } = await import('$lib/auth/crypto-utils.js');
		const rpId = window.location.hostname === 'localhost' ? 'localhost' : 'biubiu.tools';
		const publicKeyOptions: PublicKeyCredentialRequestOptions = {
			challenge: new TextEncoder().encode(challenge),
			rpId,
			userVerification: 'required',
			timeout: 60_000
		};
		// 用已登录用户的 credentialId 限定签名，避免弹出多选
		const userCredId = authStore.user?.credentialId;
		const epCredId = endpointStore.endpoints.find((e) => root.startsWith(e.url))?.credentialId;
		const credId = userCredId ?? epCredId;
		if (credId) {
			publicKeyOptions.allowCredentials = [
				{ id: fromBase64url(credId), type: 'public-key' }
			];
		}
		const assertion = await navigator.credentials.get({ publicKey: publicKeyOptions }) as PublicKeyCredential | null;

		if (!assertion) { controlError = 'Signing cancelled'; return null; }
		const resp = assertion.response as AuthenticatorAssertionResponse;
		return {
			signature: {
				credentialId: toBase64url(assertion.rawId),
				authenticatorData: toBase64url(resp.authenticatorData),
				clientDataJSON: toBase64url(resp.clientDataJSON),
				signature: toBase64url(resp.signature),
			}
		};
	}

	async function handleControlAction(action: 'pause' | 'start') {
		const parsed = parseEngineUrl(activeStrategy.baseUrl);
		if (!parsed) return;
		controlLoading = true;
		controlError = '';
		try {
			const auth = await getSignedAuth(parsed.root);
			if (!auth) return;

			const res = await engineFetch(`${parsed.root}/api/engine/${parsed.strategyId}/${action}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ payload: {}, ...auth }),
			});
			const result = await res.json() as { ok: boolean; error?: string };
			if (result.ok) {
				controlStatus = action === 'pause' ? 'paused' : 'running';
			} else {
				controlError = result.error ?? 'Action failed';
			}
		} catch (err) {
			controlError = err instanceof Error ? err.message : 'Error';
		} finally {
			controlLoading = false;
		}
	}

	async function handleSaveParams() {
		const parsed = parseEngineUrl(activeStrategy.baseUrl);
		if (!parsed) return;
		controlLoading = true;
		controlError = '';
		try {
			const auth = await getSignedAuth(parsed.root);
			if (!auth) return;

			const overrides: Record<string, unknown> = {};
			if (editEntryAmount !== null) overrides.entryAmount = editEntryAmount;
			if (editMaxBuyPrice !== null) {
				overrides.fixedDirectionMaxBuyPrice = editMaxBuyPrice;
				overrides.prevCandleMaxBuyPrice = editMaxBuyPrice;
			}
			// 入场窗口
			overrides.entryWindows = editEntryWindows.map((w, i) => ({
				windowNumber: i + 1,
				remainingSecondsStart: w.start,
				remainingSecondsEnd: w.end,
			}));
			// 运行时段网格
			if (scheduleDirty) {
				overrides._schedule = { grid: scheduleGrid, tz: localTz };
			}

			const res = await engineFetch(`${parsed.root}/api/engine/${parsed.strategyId}/config`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ payload: { overrides }, ...auth }),
			});
			const result = await res.json() as { ok: boolean; error?: string };
			if (result.ok) {
				controlError = '';
				controlSuccess = t('btcUpdown.control.saved');
				origEntryAmount = editEntryAmount;
				origMaxBuyPrice = editMaxBuyPrice;
				origEntryWindowsJson = JSON.stringify(editEntryWindows);
				origScheduleJson = JSON.stringify(scheduleGrid);
				paramsDirty = false;
				setTimeout(() => { controlSuccess = ''; }, 3000);
			} else {
				controlError = result.error ?? 'Save failed';
			}
		} catch (err) {
			controlError = err instanceof Error ? err.message : 'Error';
		} finally {
			controlLoading = false;
		}
	}

	function addEntryWindow() { editEntryWindows = [...editEntryWindows, { start: 160, end: 130 }]; }
	function removeEntryWindow(i: number) { editEntryWindows = editEntryWindows.filter((_, idx) => idx !== i); }

	// ─── V70 批量买入 ───
	let v70Direction = $state<'Up' | 'Down'>('Up');
	let v70Rounds = $state(12);
	let v70Amount = $state(5);
	let v70MaxPrice = $state(0.51);
	let v70Loading = $state(false);
	let v70Error = $state('');
	let v70Results = $state<Array<{ slug: string; success: boolean; shares?: number; cost?: number; error?: string }> | null>(null);

	function isV70Url(): boolean {
		return parseEngineUrl(activeStrategy.baseUrl)?.strategyId === 'v70';
	}

	async function handleV70Buy() {
		const parsed = parseEngineUrl(activeStrategy.baseUrl);
		if (!parsed) return;
		v70Loading = true;
		v70Error = '';
		v70Results = null;
		try {
			const auth = await getSignedAuth(parsed.root);
			if (!auth) { v70Loading = false; return; }

			const res = await engineFetch(`${parsed.root}/api/engine/batch-buy`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					payload: { direction: v70Direction, rounds: v70Rounds, amount: v70Amount, maxPrice: v70MaxPrice },
					...auth,
				}),
			});
			const result = await res.json() as { ok: boolean; results?: typeof v70Results; error?: string };
			if (result.ok && result.results) {
				v70Results = result.results;
				const filled = result.results.filter(r => r.success).length;
				const totalCost = result.results.reduce((s, r) => s + (r.cost ?? 0), 0);
				v70Error = '';
			} else {
				v70Error = result.error ?? 'Failed';
			}
		} catch (err) {
			v70Error = err instanceof Error ? err.message : 'Error';
		} finally {
			v70Loading = false;
		}
	}

	function scheduleIdx(day: number, hour: number): number { return day * HOUR_ROWS + hour; }

	function onCellDown(day: number, hour: number, e: PointerEvent) {
		e.preventDefault();
		(e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
		isDragging = true;
		const idx = scheduleIdx(day, hour);
		dragValue = !scheduleGrid[idx]; // toggle: if was on → paint off, vice versa
		dragStartCell = idx;
		scheduleGrid[idx] = dragValue;
	}

	function onCellEnter(day: number, hour: number) {
		if (!isDragging) return;
		scheduleGrid[scheduleIdx(day, hour)] = dragValue;
	}

	function onDragEnd() {
		isDragging = false;
	}

	function selectAllSchedule() { scheduleGrid = new Array(DAY_COLS * HOUR_ROWS).fill(true); }
	function clearAllSchedule() { scheduleGrid = new Array(DAY_COLS * HOUR_ROWS).fill(false); }

	function toggleDayColumn(day: number) {
		const allOn = Array.from({ length: HOUR_ROWS }, (_, h) => scheduleGrid[scheduleIdx(day, h)]).every(Boolean);
		for (let h = 0; h < HOUR_ROWS; h++) scheduleGrid[scheduleIdx(day, h)] = !allOn;
	}

	// 统计选中格子数
	const selectedCells = $derived(scheduleGrid.filter(Boolean).length);
	const totalCells = DAY_COLS * HOUR_ROWS;

	// strategyInfo is now in store.strategyInfo
	let allStrategyInfos = new SvelteMap<string, StrategyInfo | null>();
	let allStrategyProfits = new SvelteMap<string, StrategyProfitData | null>();
	let lastProfitRefreshTime = $state(0);
	let profitRefreshing = $state(false);
	const customStrategiesByHost = $derived(
		Array.from(
			customStrategies.reduce((groups, s) => {
				let host: string;
				try {
					host = new URL(s.baseUrl).host;
				} catch {
					host = 'unknown';
				}
				if (!groups.has(host)) groups.set(host, []);
				groups.get(host)!.push(s);
				return groups;
			}, new Map<string, StrategyEndpoint[]>())
		)
	);
	// Sidebar profit column navigation offsets (0 = current, -1 = previous, etc.)
	let profitRoundOffset = $state(0);
	let profitHourOffset = $state(0);
	let profitDayOffset = $state(0);
	// Sidebar sort state
	let profitSortColumn = $state<'name' | 'day' | 'all' | null>(null);
	let profitSortDir = $state<'asc' | 'desc'>('desc');
	let collapsedSections = new SvelteSet<string>();

	function toggleCollapse(key: string) {
		if (collapsedSections.has(key)) {
			collapsedSections.delete(key);
		} else {
			collapsedSections.add(key);
		}
		persistState();
	}
	const hiddenBuiltinCount = $derived(
		builtinStrategies.filter((s) => hiddenStrategyIds.has(s.id)).length
	);
	const visibleBuiltins = $derived(builtinStrategies.filter((s) => !hiddenStrategyIds.has(s.id)));
	const hiddenBuiltins = $derived(builtinStrategies.filter((s) => hiddenStrategyIds.has(s.id)));
	// Custom strategy UI state
	let showAddStrategy = $state(false);
	let customUrlInput = $state('');
	let customUrlError = $state('');
	let customUrlValidating = $state(false);
	let validationSteps = $state<ValidationProgress[]>([]);

	let timeFormat = $state<TimeFormat>('24');

	// Mobile strategy drawer
	let mobileDrawerOpen = $state(false);

	// History / Live tab toggle
	let historyTab = $state<'rounds' | 'live'>('rounds');

	// (Data state, filter state, and loading state are now in store)

	const seoProps = $derived(
		getBaseSEO({
			title: t('btcUpdown.title'),
			description: t('btcUpdown.description'),
			currentLocale: locale.value
		})
	);

	// --- SSE, data fetching, and filter coordination are now in DashboardStore ---

	async function fetchAllStrategies() {
		const lang = 'en';
		const results = await Promise.all(
			allKnownStrategies.map(async (s) => {
				try {
					const f = s.type === 'custom' ? strategyFetch : fetch;
					const res = await f(`${s.baseUrl}/strategy?lang=${lang}`);
					return { id: s.id, info: res.ok ? ((await res.json()) as StrategyInfo) : null };
				} catch {
					return { id: s.id, info: null };
				}
			})
		);
		for (const r of results) {
			if (r.info) allStrategyInfos.set(r.id, r.info);
		}
	}

	async function fetchAllStrategyProfits() {
		profitRefreshing = true;
		const profitOpts = { profitRoundOffset, profitHourOffset, profitDayOffset };

		// Fetch profits for simulation strategies
		const strategyResults = await Promise.all(
			allRegisteredStrategies.map(async (s) => {
				const fetchFn = s.type === 'custom'
					? strategyFetch
					: (url: string) => fetch(url, { cache: 'no-store' });
				const profits = await fetchStrategyProfitData(
					{ baseUrl: s.baseUrl, fetchFn },
					profitOpts
				);
				return { id: s.id, profits };
			})
		);

		// Fetch profits for live instances
		const instanceResults: { id: string; profits: StrategyProfitData | null }[] = [];
		for (const ep of endpointStore.endpoints) {
			const instances = endpointInstances.get(ep.url) ?? [];
			const fetchFn = createEndpointFetchFn(ep);
			const epResults = await Promise.all(
				instances.map(async (inst) => {
					const baseUrl = `${ep.url}/api/engine/${inst.id}`;
					const profits = await fetchStrategyProfitData({ baseUrl, fetchFn }, profitOpts);
					return { id: makeInstanceId(ep.url, inst.id), profits };
				})
			);
			instanceResults.push(...epResults);
		}

		const results = [...strategyResults, ...instanceResults];
		// Update in-place to avoid UI flash (bug fix: was allStrategyProfits.clear())
		const newIds = new Set(results.map((r) => r.id));
		for (const key of allStrategyProfits.keys()) {
			if (!newIds.has(key)) allStrategyProfits.delete(key);
		}
		for (const r of results) allStrategyProfits.set(r.id, r.profits);
		lastProfitRefreshTime = Date.now();
		profitRefreshing = false;

		// Re-probe custom endpoints for newly added strategies
		for (const [, strategies] of customStrategiesByHost) {
			const sample = strategies[0];
			if (sample) probeServerSiblings(sample.baseUrl);
		}
	}

	/** Sync URL query params to reflect the active strategy */
	function syncUrlParams(strategyId?: string) {
		if (!browser) return;
		const url = new URL(window.location.href);
		// Strategy params
		const sid = strategyId ?? activeStrategyId;
		const strategy = allKnownStrategies.find((s) => s.id === sid);
		if (strategy) {
			if (strategy.type === 'builtin') {
				url.searchParams.set('s', strategy.label);
				url.searchParams.delete('url');
			} else {
				url.searchParams.set('s', 'custom');
				url.searchParams.set('url', strategy.baseUrl);
			}
		}
		// Settings params (only write non-default values)
		const settings = loadSettings();
		if (settings.theme !== 'dark') url.searchParams.set('th', settings.theme);
		else url.searchParams.delete('th');
		if (settings.textScale !== 'md') url.searchParams.set('ts', settings.textScale);
		else url.searchParams.delete('ts');
		if (preferences.numberLocale !== 'en-US') url.searchParams.set('nl', preferences.numberLocale);
		else url.searchParams.delete('nl');
		if (preferences.dateLocale !== 'en-US') url.searchParams.set('dl', preferences.dateLocale);
		else url.searchParams.delete('dl');
		if (preferences.currency !== 'USD') url.searchParams.set('cur', preferences.currency);
		else url.searchParams.delete('cur');
		history.replaceState(history.state, '', url.toString());
	}

	function onStrategyChange(strategyId: string) {
		if (strategyId === activeStrategyId) return;
		activeStrategyId = strategyId;
		mobileDrawerOpen = false;
		// Don't sync URL for instance-based strategies (they contain endpoint tokens)
		if (!isInstanceId(strategyId)) {
			syncUrlParams(strategyId);
		}
		persistState();
		// Store handles: disconnect SSE, reset data, reconnect, refetch all
		store.switchStrategy(getStoreConfig());
		const lang = 'en';
		store.fetchInitialData(lang);
		// Set date to today (same as mount behavior) — this won't re-fetch
		// since filterDate was already reset; it just shows "today" in the picker
		store.filterDate = { from: todayLocal(), to: todayLocal() };
	}

	function persistState() {
		savePersistedState({
			customStrategies,
			visibleDiscoveredIds: [...visibleDiscoveredIds],
			hiddenStrategyIds: [...hiddenStrategyIds],
			activeStrategyId,
			collapsedSections: [...collapsedSections]
		});
	}

	async function addCustomStrategy() {
		const rawInput = customUrlInput.trim();

		// Auto-detect managed endpoint URL: {base}/{token}/{clientId}
		const managed = parseManagedEndpointUrl(rawInput);
		if (managed) {
			customUrlError = '';
			customUrlValidating = true;
			try {
				const result = await endpointStore.addEndpoint(
					managed.baseUrl, managed.token, managed.clientId,
					managed.baseUrl
				);
				if (!result.ok) {
					customUrlError = result.error;
					customUrlValidating = false;
					return;
				}
				endpointStore.setActive(managed.baseUrl.replace(/\/+$/, ''));
				customUrlInput = '';
				showAddStrategy = false;
				customUrlValidating = false;
				// Fetch instances for the new endpoint
				refreshEndpointInstances().then(() => {
					// Auto-select first instance if available
					const instances = endpointInstances.get(managed.baseUrl.replace(/\/+$/, ''));
					if (instances?.length) {
						const first = instances.find((i) => i.status === 'running') ?? instances[0];
						if (first) onStrategyChange(makeInstanceId(managed.baseUrl.replace(/\/+$/, ''), first.id));
						fetchAllStrategyProfits();
					}
				});
				// Auto-prompt passkey registration if available
				if (result.capabilities.passkey.canRegister) {
					const ep = endpointStore.activeEndpoint;
					if (ep) handleRegisterPasskeyInline(ep);
				}
			} catch (err) {
				customUrlError = err instanceof Error ? err.message : 'Connection failed';
				customUrlValidating = false;
			}
			return;
		}

		// Endpoint discovery flow: user provides root URL, we discover all strategies
		let endpointUrl = normalizeStrategyUrl(rawInput);
		if (!endpointUrl) {
			customUrlError = t('btcUpdown.strategy.invalidUrl');
			return;
		}
		try {
			new URL(endpointUrl);
		} catch {
			customUrlError = t('btcUpdown.strategy.invalidUrl');
			return;
		}
		// Strip /api or /api/vN suffix if user pasted a full strategy URL
		endpointUrl = endpointUrl.replace(/\/api(\/v\d+)?$/, '');

		customUrlError = '';
		validationSteps = [{ step: 'discovery', status: 'checking' }];
		customUrlValidating = true;
		const lang = 'en';

		// Discover strategies from the endpoint
		const result = await discoverStrategies(endpointUrl, '/api/strategies', lang, strategyFetch);
		if (!result || result.strategies.length === 0) {
			validationSteps = [{ step: 'discovery', status: 'fail' }];
			customUrlError = 'No strategies found at this endpoint';
			customUrlValidating = false;
			return;
		}
		validationSteps = [{ step: 'discovery', status: 'ok' }];

		// Add discovered strategies as custom strategies so they show in the sidebar
		const existingIds = new Set(customStrategies.map((s) => s.id));
		const existingUrls = new Set(customStrategies.map((s) => s.baseUrl));
		const newCustom = result.strategies
			.filter((s) => !existingIds.has(s.id) && !existingUrls.has(s.baseUrl))
			.map((s) => ({ ...s, type: 'custom' as const, addedAt: Date.now() }));
		if (newCustom.length > 0) {
			customStrategies = [...customStrategies, ...newCustom];
		}
		for (let i = 0; i < result.strategies.length; i++) {
			allStrategyInfos.set(result.strategies[i].id, result.raw[i]);
		}

		customUrlInput = '';
		validationSteps = [];
		showAddStrategy = false;
		customUrlValidating = false;
		persistState();
		// Select the first discovered strategy
		onStrategyChange(result.strategies[0].id);
		fetchAllStrategies();
	}

	async function probeServerSiblings(strategyUrl: string) {
		const disc = getDiscoveryUrl(strategyUrl);
		if (!disc) return;
		const lang = 'en';
		const result = await discoverStrategies(disc.origin, disc.path, lang, strategyFetch);
		if (!result) return;
		const host = new URL(strategyUrl).host;
		// Filter out strategies that the user explicitly added as custom
		const customUrls = new Set(customStrategies.map((s) => s.baseUrl));
		const siblings = result.strategies.filter((s) => !customUrls.has(s.baseUrl));
		discoveredSiblings.set(host, siblings);
		// Auto-show newly discovered siblings (default visible)
		let changed = false;
		for (const s of siblings) {
			if (!visibleDiscoveredIds.has(s.id)) {
				visibleDiscoveredIds.add(s.id);
				changed = true;
			}
		}
		if (changed) {
			visibleDiscoveredIds = new Set(visibleDiscoveredIds);
			persistState();
			fetchAllStrategyProfits();
		}
		// Store their info
		for (let i = 0; i < result.strategies.length; i++) {
			const s = result.strategies[i];
			if (siblings.some((sib) => sib.id === s.id)) {
				allStrategyInfos.set(s.id, result.raw[i]);
			}
		}
	}

	function removeCustomStrategy(id: string) {
		const removed = customStrategies.find((s) => s.id === id);
		customStrategies = customStrategies.filter((s) => s.id !== id);
		if (removed) cleanupHost(removed.baseUrl);
		if (activeStrategyId === id) {
			activeStrategyId = builtinStrategies[0]?.id ?? 'builtin:v1';
			onStrategyChange(activeStrategyId);
		}
		persistState();
		fetchAllStrategies();
	}

	function removeHostStrategies(host: string) {
		const hostStrategies = customStrategies.filter((s) => {
			try {
				return new URL(s.baseUrl).host === host;
			} catch {
				return false;
			}
		});
		customStrategies = customStrategies.filter((s) => !hostStrategies.some((h) => h.id === s.id));
		// Clean up discovered siblings
		const siblings = discoveredSiblings.get(host) ?? [];
		for (const sib of siblings) visibleDiscoveredIds.delete(sib.id);
		visibleDiscoveredIds = new SvelteSet(visibleDiscoveredIds);
		discoveredSiblings.delete(host);
		configPanelSection = null;
		// Switch active if needed
		if (
			hostStrategies.some((s) => s.id === activeStrategyId) ||
			siblings.some((s) => s.id === activeStrategyId)
		) {
			activeStrategyId = builtinStrategies[0]?.id ?? 'builtin:v1';
			onStrategyChange(activeStrategyId);
		}
		persistState();
		fetchAllStrategies();
	}

	/** Clean up host siblings if no custom strategies remain for that host */
	function cleanupHost(baseUrl: string) {
		try {
			const host = new URL(baseUrl).host;
			const remaining = customStrategies.filter((s) => {
				try {
					return new URL(s.baseUrl).host === host;
				} catch {
					return false;
				}
			});
			if (remaining.length === 0) {
				const siblings = discoveredSiblings.get(host) ?? [];
				for (const sib of siblings) visibleDiscoveredIds.delete(sib.id);
				visibleDiscoveredIds = new SvelteSet(visibleDiscoveredIds);
				discoveredSiblings.delete(host);
			}
		} catch {
			/* ignore */
		}
	}

	function toggleStrategyVisibility(id: string) {
		if (id.startsWith('discovered:')) {
			// Discovered siblings: opt-in via visibleDiscoveredIds only
			if (visibleDiscoveredIds.has(id)) {
				visibleDiscoveredIds.delete(id);
				visibleDiscoveredIds = new Set(visibleDiscoveredIds);
				// If this was active, switch away
				if (activeStrategyId === id) {
					const first = allRegisteredStrategies.find((s) => s.id !== id);
					if (first) onStrategyChange(first.id);
				}
			} else {
				visibleDiscoveredIds.add(id);
				visibleDiscoveredIds = new Set(visibleDiscoveredIds);
			}
		} else {
			// Builtin / custom: opt-out via hiddenStrategyIds
			if (hiddenStrategyIds.has(id)) {
				hiddenStrategyIds.delete(id);
				hiddenStrategyIds = new Set(hiddenStrategyIds);
			} else {
				hiddenStrategyIds.add(id);
				hiddenStrategyIds = new Set(hiddenStrategyIds);
				// If hidden strategy was active, switch away
				if (activeStrategyId === id) {
					const first = allRegisteredStrategies.find((s) => s.id !== id);
					if (first) onStrategyChange(first.id);
				}
			}
		}
		persistState();
		fetchAllStrategyProfits();
	}

	function navigateProfitColumn(column: 'round' | 'hour' | 'day' | 'all', dir: -1 | 1) {
		if (column === 'all') return;
		if (column === 'round') {
			const next = profitRoundOffset + dir;
			if (next > 0) return;
			profitRoundOffset = next;
		} else if (column === 'hour') {
			const next = profitHourOffset + dir;
			if (next > 0) return;
			profitHourOffset = next;
		} else {
			const next = profitDayOffset + dir;
			if (next > 0) return;
			profitDayOffset = next;
		}
		fetchAllStrategyProfits();
	}

	function sortStrategies<T extends { id: string; label: string }>(list: T[]): T[] {
		if (!profitSortColumn) return list;
		const col = profitSortColumn;
		const dir = profitSortDir === 'desc' ? -1 : 1;
		if (col === 'name') {
			return [...list].sort((a, b) => {
				const na = allStrategyInfos.get(a.id)?.name ?? a.label;
				const nb = allStrategyInfos.get(b.id)?.name ?? b.label;
				return naturalCompare(na, nb) * dir;
			});
		}
		return [...list].sort((a, b) => {
			const pa = allStrategyProfits.get(a.id);
			const pb = allStrategyProfits.get(b.id);
			const va = pa ? pa[col].profit : 0;
			const vb = pb ? pb[col].profit : 0;
			return (va - vb) * dir;
		});
	}

	function resetProfitColumn(column: 'round' | 'hour' | 'day') {
		if (column === 'round') profitRoundOffset = 0;
		else if (column === 'hour') profitHourOffset = 0;
		else profitDayOffset = 0;
		fetchAllStrategyProfits();
	}

	/** Jump main content filters to the date/hour the sidebar column is showing */
	function jumpToColumnContext(column: 'round' | 'hour' | 'day') {
		if (column === 'day' && profitDayOffset !== 0) {
			const d = new Date();
			d.setDate(d.getDate() + profitDayOffset);
			const ds = d.toLocaleDateString('en-CA');
			store.setDateRange(ds, ds);
		} else if (column === 'hour' && profitHourOffset !== 0) {
			const d = new Date();
			d.setMinutes(0, 0, 0);
			d.setHours(d.getHours() + profitHourOffset);
			const ds = d.toLocaleDateString('en-CA');
			store.filterDate = { from: ds, to: ds };
			store.selectHour(d.getHours());
		} else if (column === 'round' && profitRoundOffset !== 0) {
			store.setPage(Math.abs(profitRoundOffset));
		}
	}

	function getProfitColumnLabel(column: 'round' | 'hour' | 'day' | 'all'): string {
		if (column === 'round') {
			if (profitRoundOffset === 0) return t('btcUpdown.strategy.profitLast');
			return `${profitRoundOffset}`;
		}
		if (column === 'hour') {
			if (profitHourOffset === 0) return t('btcUpdown.strategy.profit1h');
			// Show actual hour, e.g. "14:00"
			const d = new Date();
			d.setMinutes(0, 0, 0);
			d.setHours(d.getHours() + profitHourOffset);
			return `${String(d.getHours()).padStart(2, '0')}:00`;
		}
		if (column === 'all') return t('btcUpdown.strategy.profitAll');
		if (profitDayOffset === 0) return t('btcUpdown.strategy.profitToday');
		// Show actual date, e.g. "03/15"
		const d = new Date();
		d.setDate(d.getDate() + profitDayOffset);
		return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
	}

	function onDateChange() {
		store.setDateRange(store.filterDate.from, store.filterDate.to);
	}

	// --- Effects ---

	$effect(() => {
		if (browser) {
			untrack(() => {
				// Load persisted state
				const persisted = loadPersistedState();
				customStrategies = persisted.customStrategies;
				visibleDiscoveredIds = new Set(persisted.visibleDiscoveredIds ?? []);
				const needsDefaultHidden = persisted.hiddenStrategyIds === null;
				hiddenStrategyIds = new Set(persisted.hiddenStrategyIds ?? []);
				activeStrategyId = persisted.activeStrategyId;
				if (persisted.collapsedSections?.length) {
					for (const s of persisted.collapsedSections) collapsedSections.add(s);
				}

				// Read URL query params for strategy sharing
				const urlParams = new URLSearchParams(window.location.search);
				const urlStrategy = urlParams.get('s');
				const urlEndpoint = urlParams.get('url');

				// Apply settings from URL (temporary override for shared links)
				const urlTheme = urlParams.get('th');
				const urlTextScale = urlParams.get('ts');
				const urlNumberLocale = urlParams.get('nl');
				const urlDateLocale = urlParams.get('dl');
				const urlCurrency = urlParams.get('cur');
				if (urlTheme && ['dark', 'light'].includes(urlTheme)) {
					applyTheme(urlTheme as Theme);
				}
				if (urlTextScale && ['xs', 'sm', 'md', 'lg', 'xl', '2xl'].includes(urlTextScale)) {
					applyTextScale(urlTextScale as TextScale);
				}
				if (urlNumberLocale) preferences.numberLocale = urlNumberLocale;
				if (urlDateLocale) preferences.dateLocale = urlDateLocale;
				if (urlCurrency) preferences.currency = urlCurrency;

				// Load time format and timezone from settings
				const pageSettings = loadSettings();
				timeFormat = pageSettings.timeFormat;
				if (pageSettings.timezone) preferences.timezone = pageSettings.timezone;
				// Listen for settings changes (same-tab custom event)
				const onSettingsChanged = (e: Event) => {
					const s = (e as CustomEvent).detail;
					if (s.timeFormat === '12' || s.timeFormat === '24') timeFormat = s.timeFormat;
					if (s.timezone) preferences.timezone = s.timezone;
				};
				window.addEventListener('settings-changed', onSettingsChanged);

				// Handle custom strategy from URL: auto-add if not already present
				if (urlStrategy === 'custom' && urlEndpoint) {
					const normalized = normalizeStrategyUrl(urlEndpoint);
					if (normalized) {
						const existing = [...customStrategies, ...builtinStrategies].find(
							(s) => s.baseUrl === normalized
						);
						if (existing) {
							activeStrategyId = existing.id;
							// Unhide if hidden
							if (hiddenStrategyIds.has(existing.id)) {
								hiddenStrategyIds.delete(existing.id);
								hiddenStrategyIds = new Set(hiddenStrategyIds);
							}
						} else {
							// Auto-add as custom strategy
							const newStrategy: StrategyEndpoint = {
								id: generateCustomId(),
								label: normalized,
								baseUrl: normalized,
								type: 'custom',
								addedAt: Date.now()
							};
							customStrategies = [...customStrategies, newStrategy];
							activeStrategyId = newStrategy.id;
							// Fetch name and probe siblings in background
							const lang = 'en';
							strategyFetch(`${normalized}/strategy?lang=${lang}`)
								.then(async (res) => {
									if (res.ok) {
										const info = await res.json();
										if (info?.name) {
											newStrategy.label = info.name;
											customStrategies = [...customStrategies];
											allStrategyInfos.set(newStrategy.id, info);
											persistState();
										}
									}
								})
								.catch(() => {});
							probeServerSiblings(normalized);
						}
						persistState();
					}
				}

				// Default to today's date
				store.filterDate = { from: todayLocal(), to: todayLocal() };

				// Discover default server strategies (replaces hardcoded list)
				const lang = 'en';
				discoverStrategies(API_HOST, '/api/strategies', lang).then((result) => {
					if (result) {
						builtinStrategies = result.strategies.map((s) => ({
							...s,
							id: `builtin:${s.label}`,
							type: 'builtin' as const
						}));
						// Populate strategy infos from discovery
						for (let i = 0; i < result.strategies.length; i++) {
							allStrategyInfos.set(`builtin:${result.strategies[i].label}`, result.raw[i]);
						}
					}
					// First visit: hide builtins not in DEFAULT_VISIBLE_BUILTINS
					if (needsDefaultHidden) {
						const toHide = builtinStrategies
							.filter((s) => !DEFAULT_VISIBLE_BUILTINS.has(s.label))
							.map((s) => s.id);
						hiddenStrategyIds = new Set(toHide);
						persistState();
					}
					// Handle builtin strategy from URL (after discovery so we know all versions)
					if (urlStrategy && urlStrategy !== 'custom') {
						const builtinId = `builtin:${urlStrategy}`;
						if (builtinStrategies.some((s) => s.id === builtinId)) {
							activeStrategyId = builtinId;
							// Unhide if hidden
							if (hiddenStrategyIds.has(builtinId)) {
								hiddenStrategyIds.delete(builtinId);
								hiddenStrategyIds = new Set(hiddenStrategyIds);
							}
							persistState();
						}
					}
					// Validate active strategy exists (after discovery resolves)
					if (!allRegisteredStrategies.find((s) => s.id === activeStrategyId)) {
						activeStrategyId = builtinStrategies[0]?.id ?? 'builtin:v1';
					}
					syncUrlParams(activeStrategyId);
					// Re-fetch strategy names with current locale (discovery may have used stale lang)
					fetchAllStrategies();
					fetchAllStrategyProfits();
					// Start data fetching via store (SSE, rounds, stats, hourly, etc.)
					store.connect();
					const lang2 = 'en';
					store.fetchInitialData(lang2);
				});

				// Load instances for any managed endpoints, then refresh profits to include them
				refreshEndpointInstances().then(() => {
					if (endpointInstances.size > 0) fetchAllStrategyProfits();
				});

				// Re-probe siblings for custom servers
				const customHosts = new Set<string>();
				for (const s of customStrategies) {
					try {
						customHosts.add(new URL(s.baseUrl).host);
					} catch {
						/* ignore */
					}
				}
				for (const host of customHosts) {
					const sample = customStrategies.find((s) => {
						try {
							return new URL(s.baseUrl).host === host;
						} catch {
							return false;
						}
					});
					if (sample) probeServerSiblings(sample.baseUrl);
				}
			});
		}
	});

	// Re-fetch strategy info when locale changes (layout $effect sets locale async)
	$effect(() => {
		if (!browser) return;
		void locale.value; // track locale reactively
		untrack(() => {
			const lang = 'en';
			store.fetchStrategyInfo(lang);
			fetchAllStrategies();
			fetchAllStrategyProfits();
		});
	});

	// Subscribe to clock and check round expiry
	$effect(() => {
		if (!browser) return;
		const unsub = clock.subscribe();
		return unsub;
	});

	$effect(() => {
		if (!browser) return;
		const _now = clock.now; // track reactivity
		store.checkRoundExpiry(_now);
	});

	// Auto-refresh strategy profits every 30s (only when viewing current data)
	$effect(() => {
		if (browser) {
			const interval = setInterval(() => {
				if (profitRoundOffset === 0 && profitHourOffset === 0 && profitDayOffset === 0) {
					fetchAllStrategyProfits();
				}
				// Also refresh instance data for sidebar display
				if (endpointStore.endpoints.length > 0) {
					refreshEndpointInstances();
				}
			}, 30_000);
			return () => clearInterval(interval);
		}
	});

	// Re-sync URL when preferences change (so shared links reflect current settings)
	$effect(() => {
		if (!browser) return;
		// Track reactive preferences
		void preferences.numberLocale;
		void preferences.dateLocale;
		void preferences.currency;
		untrack(() => syncUrlParams());
	});

	onDestroy(() => {
		store.disconnect();
	});

	// --- Filter helpers ---

	function getEventMessage(event: SSEEvent): string {
		const d = event.data;
		switch (event.type) {
			case 'round_start':
				return t('btcUpdown.live.roundStart', {
					id: String(d.roundId ?? ''),
					remaining: String(d.totalRemaining ?? ''),
					range: String(d.priceRange ?? '')
				});
			case 'entry':
				return t('btcUpdown.live.entry', {
					direction: String(d.direction ?? ''),
					shares: String(
						typeof d.shares === 'number'
							? formatNumber(d.shares, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
							: (d.shares ?? '')
					),
					price: String(
						typeof d.avgPrice === 'number'
							? formatNumber(d.avgPrice, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
							: (d.avgPrice ?? '')
					),
					cost: String(d.cost ?? '50')
				});
			case 'settlement': {
				const won = d.won as boolean;
				const key = won ? 'btcUpdown.live.settlementWin' : 'btcUpdown.live.settlementLoss';
				return t(key, {
					direction: String(d.direction ?? ''),
					outcome: String(d.outcome ?? ''),
					profit: fmtProfit((d.totalProfit as number) ?? 0)
				});
			}
			case 'exit_trigger':
				return t('btcUpdown.live.exitTrigger', {
					type: String(d.type ?? ''),
					price: String(
						typeof d.exitPrice === 'number'
							? formatNumber(d.exitPrice, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
							: (d.exitPrice ?? '')
					),
					profit: fmtProfit((d.profit as number) ?? 0)
				});
			case 'hedge_placed':
				return t('btcUpdown.live.hedgePlaced', {
					shares: String(d.shares ?? '100'),
					direction: String(d.direction ?? ''),
					price: String(
						typeof d.limitPrice === 'number' ? formatCurrency(d.limitPrice) : (d.limitPrice ?? '')
					)
				});
			case 'hedge_filled':
				return t('btcUpdown.live.hedgeFilled', {
					shares: String(d.shares ?? ''),
					direction: String(d.direction ?? ''),
					price: String(
						typeof d.fillPrice === 'number' ? formatCurrency(d.fillPrice) : (d.fillPrice ?? '')
					)
				});
			case 'hedge_sold':
				return t('btcUpdown.live.hedgeSold', {
					shares: String(
						typeof d.shares === 'number'
							? formatNumber(d.shares, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
							: (d.shares ?? '')
					),
					direction: String(d.direction ?? ''),
					price: String(
						typeof d.avgPrice === 'number' ? formatCurrency(d.avgPrice) : (d.avgPrice ?? '')
					),
					revenue: String(
						typeof d.revenue === 'number' ? formatCurrency(d.revenue) : (d.revenue ?? '')
					)
				});
			case 'hedge_expired':
				return t('btcUpdown.live.hedgeExpired', {
					direction: String(d.direction ?? '')
				});
			case 'round_skip':
				return t('btcUpdown.live.roundSkip', {
					id: String(d.roundId ?? ''),
					checks: String(d.windowsChecked ?? ''),
					range: String(d.priceRange ?? '')
				});
			default:
				return String(d.message ?? event.type);
		}
	}

	// Filter setters are now store.setFilter(), store.setSignalFilter(), store.setResultFilter()
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<!-- Header -->
	<section class="page-header" use:fadeInUp={{ delay: 0 }}>
		<div class="title-row">
			<h1 class="page-title">{t('btcUpdown.title')}</h1>
			<div class="status-badge status-{store.connectionStatus}">
				<span class="status-dot"></span>
				{#if store.connectionStatus === 'connected'}
					{t('btcUpdown.connected')}
				{:else if store.connectionStatus === 'connecting'}
					{t('btcUpdown.connecting')}
				{:else if store.connectionStatus === 'reconnecting'}
					{t('btcUpdown.reconnecting')}
				{:else}
					{t('btcUpdown.disconnected')}
				{/if}
			</div>
		</div>
		<p class="page-description">{t('btcUpdown.description')}</p>
	</section>

	<!-- Mobile floating button to open strategy drawer -->
	{#if !mobileDrawerOpen}
	<button
		class="mobile-drawer-fab"
		onclick={() => { mobileDrawerOpen = true; }}
	>
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
		<span class="mobile-fab-label">{store.strategyInfo?.name ?? activeStrategy.label}</span>
	</button>
	{/if}

	<!-- Mobile drawer backdrop -->
	{#if mobileDrawerOpen}
		<div
			class="mobile-drawer-backdrop"
			onclick={() => { mobileDrawerOpen = false; }}
			onkeydown={(e) => { if (e.key === 'Escape') mobileDrawerOpen = false; }}
			role="button"
			tabindex={-1}
			transition:fly={{ duration: 200, opacity: 0 }}
		></div>
	{/if}

	<div class="page-layout">
		<!-- Sidebar (strategy panel) -->
		<aside class="sidebar" class:mobile-drawer-open={mobileDrawerOpen}>
			<!-- Mobile drawer handle -->
			<div class="mobile-drawer-handle" onclick={() => { mobileDrawerOpen = false; }}>
				<div class="drawer-handle-bar"></div>
			</div>
			{#snippet profitCells(profits: StrategyProfitData)}
				<span class="strategy-profits">
					<span class="profit-cell">
						<span
							class="profit-val"
							class:positive={profits.day.profit >= 0}
							class:negative={profits.day.profit < 0}
							>{profits.day.profit >= 0 ? '+' : ''}{Math.round(profits.day.profit)}</span
						>
						<span class="profit-meta"
							>{profits.day.rounds}r {Math.round(profits.day.winRate * 100)}%</span
						>
					</span>
				<span class="profit-cell">
					<span
						class="profit-val"
						class:positive={profits.all.profit >= 0}
						class:negative={profits.all.profit < 0}
						>{profits.all.profit >= 0 ? '+' : ''}{Math.round(profits.all.profit)}</span
					>
					<span class="profit-meta"
						>{profits.all.rounds}r {Math.round(profits.all.winRate * 100)}%</span
					>
				</span>
				</span>
			{/snippet}

			{#snippet columnHeaders()}
				<div class="profit-column-labels">
					<span
						class="profit-col-label name-col-label"
						class:sort-active={profitSortColumn === 'name'}
						onclick={() => {
							if (profitSortColumn === 'name') {
								profitSortDir = profitSortDir === 'desc' ? 'asc' : 'desc';
							} else {
								profitSortColumn = 'name';
								profitSortDir = 'asc';
							}
						}}
						role="button"
						tabindex={0}
						title="Click to sort"
					>
						Name
						{#if profitSortColumn === 'name'}
							<span class="sort-indicator">{profitSortDir === 'desc' ? '↓' : '↑'}</span>
						{/if}
					</span>
					<span class="profit-col-labels-right">
						{#each ['day', 'all'] as col (col)}
							{@const offset =
								col === 'round'
									? profitRoundOffset
									: col === 'day' ? profitDayOffset : 0}
							{@const colKey = col as 'round' | 'hour' | 'day' | 'all'}
							<div class="profit-col-nav">
								{#if col !== 'all'}
							<button class="col-nav-btn-v" onclick={() => navigateProfitColumn(colKey, -1)}>
									<svg width="12" height="7" viewBox="0 0 12 7"
										><path
											d="M1 6L6 1L11 6"
											fill="none"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/></svg
									>
								</button>
								{/if}
								<span
									class="profit-col-label"
									class:offset-active={offset !== 0}
									class:sort-active={profitSortColumn === col}
									onclick={() => {
										if (profitSortColumn === col) {
											profitSortDir = profitSortDir === 'desc' ? 'asc' : 'desc';
										} else {
											profitSortColumn = col as 'day' | 'all';
											profitSortDir = 'desc';
										}
									}}
									role="button"
									tabindex={0}
									title="Click to sort"
								>
									{getProfitColumnLabel(colKey)}
									{#if profitSortColumn === col}
										<span class="sort-indicator">{profitSortDir === 'desc' ? '↓' : '↑'}</span>
									{/if}
								</span>
								{#if col !== 'all'}
								<button
									class="col-nav-btn-v"
									disabled={offset === 0}
									onclick={() => navigateProfitColumn(colKey, 1)}
								>
									<svg width="12" height="7" viewBox="0 0 12 7"
										><path
											d="M1 1L6 6L11 1"
											fill="none"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/></svg
									>
								</button>
								{/if}
							</div>
						{/each}
					</span>
				</div>
			{/snippet}

			<!-- Strategy Selector -->
			{#snippet refreshIndicator()}
				{#if lastProfitRefreshTime > 0}
					{@const elapsed = Math.floor((clock.now - lastProfitRefreshTime) / 1000)}
					<span class="last-refresh-time">{elapsed}s</span>
				{/if}
				<button
					class="profit-refresh-btn"
					class:refreshing={profitRefreshing}
					onclick={(e) => { e.stopPropagation(); fetchAllStrategyProfits(); }}
					title={t('btcUpdown.strategy.refresh')}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path
							d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
						/></svg
					>
				</button>
			{/snippet}

			<div class="version-selector glass-card" use:fadeInUp={{ delay: 10 }}>
				<div class="version-header">
					<span class="version-label">{t('btcUpdown.strategy.title')}</span>
					<button class="add-strategy-btn-top" onclick={() => (showAddStrategy = true)}>
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
						{t('btcUpdown.strategy.addCustom')}
					</button>
				</div>
				<!-- Built-in strategies -->
				<div class="version-header" role="button" tabindex="0" onclick={() => toggleCollapse('builtin')} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleCollapse('builtin'); }}>
					<button class="section-collapse-btn">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class:collapsed={collapsedSections.has('builtin')}
							><polyline points="6 9 12 15 18 9" /></svg
						>
					</button>
					<span class="version-type-label">{t('btcUpdown.strategy.builtin')}</span>
					{@render refreshIndicator()}
					<span class="config-count" class:has-hidden={hiddenBuiltinCount > 0}
						>{visibleBuiltins.length}/{builtinStrategies.length}</span
					>
				</div>
				{#if !collapsedSections.has('builtin')}
					{@render columnHeaders()}
					<div class="version-options">
						{#each sortStrategies(visibleBuiltins) as s (s.id)}
							{@const profits = allStrategyProfits.get(s.id)}
							<div class="version-row">
								<button
									class="version-btn"
									class:active={activeStrategyId === s.id}
									onclick={() => onStrategyChange(s.id)}
								>
									<span class="strategy-name">{allStrategyInfos.get(s.id)?.name ?? s.label}</span>
									{#if profits}
										{@render profitCells(profits)}
									{/if}
								</button>
								{#if activeStrategyId !== s.id}
									<button
										class="row-hide-btn"
										onclick={() => toggleStrategyVisibility(s.id)}
										title="Hide"
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
									</button>
								{/if}
							</div>
						{/each}
					</div>
					<!-- Hidden strategies -->
					{#if hiddenBuiltins.length > 0}
						<button class="hidden-section-toggle" onclick={() => toggleCollapse('builtin-hidden')}>
							<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class:collapsed={collapsedSections.has('builtin-hidden')}><polyline points="6 9 12 15 18 9" /></svg>
							{`Hidden (${hiddenBuiltins.length})`}
						</button>
						{#if !collapsedSections.has('builtin-hidden')}
							<div class="version-options hidden-options">
								{#each hiddenBuiltins as s (s.id)}
									<div class="version-row row-hidden">
										<button
											class="version-btn"
											onclick={() => { toggleStrategyVisibility(s.id); onStrategyChange(s.id); }}
										>
											<span class="strategy-name">{allStrategyInfos.get(s.id)?.name ?? s.label}</span>
										</button>
										<button
											class="row-hide-btn"
											onclick={() => toggleStrategyVisibility(s.id)}
											title="Show"
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
										</button>
									</div>
								{/each}
							</div>
						{/if}
					{/if}
				{/if}
				<!-- Custom strategy groups -->
				{#each customStrategiesByHost as [host, strategies] (host)}
					{@const siblings = discoveredSiblings.get(host) ?? []}
					{@const allHostStrategies = [...strategies, ...siblings]}
					{@const isHostHidden = (s: StrategyEndpoint) => s.type === 'discovered' ? !visibleDiscoveredIds.has(s.id) : hiddenStrategyIds.has(s.id)}
					{@const visibleHostStrategies = allHostStrategies.filter((s) => !isHostHidden(s))}
					{@const hiddenHostStrategies = allHostStrategies.filter((s) => isHostHidden(s))}
					<div class="version-header custom-header" role="button" tabindex="0" onclick={() => toggleCollapse(host)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleCollapse(host); }}>
						<button class="section-collapse-btn">
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class:collapsed={collapsedSections.has(host)}><polyline points="6 9 12 15 18 9" /></svg>
						</button>
						<span class="version-type-label host-label" title={host}>{host}</span>
						<button
							class="host-remove-btn"
							onclick={(e) => { e.stopPropagation(); removeHostStrategies(host); }}
							title={t('btcUpdown.strategy.remove')}
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
						</button>
						{@render refreshIndicator()}
						<span class="config-count" class:has-hidden={hiddenHostStrategies.length > 0}
							>{visibleHostStrategies.length}/{allHostStrategies.length}</span
						>
					</div>
					{#if !collapsedSections.has(host)}
						{@render columnHeaders()}
						<div class="version-options">
							{#each sortStrategies(visibleHostStrategies) as s (s.id)}
								{@const profits = allStrategyProfits.get(s.id)}
								<div class="version-row">
									<button
										class="version-btn custom-version-btn"
										class:active={activeStrategyId === s.id}
										onclick={() => onStrategyChange(s.id)}
									>
										<span class="custom-dot"></span>
										<span class="strategy-name">{allStrategyInfos.get(s.id)?.name ?? s.label}</span>
										{#if profits}
											{@render profitCells(profits)}
										{/if}
									</button>
									{#if activeStrategyId !== s.id}
										<button
											class="row-hide-btn"
											onclick={() => toggleStrategyVisibility(s.id)}
											title="Hide"
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
										</button>
									{/if}
								</div>
							{/each}
						</div>
						<!-- Hidden strategies for this host -->
						{#if hiddenHostStrategies.length > 0}
							<button class="hidden-section-toggle" onclick={() => toggleCollapse(`${host}-hidden`)}>
								<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class:collapsed={collapsedSections.has(`${host}-hidden`)}><polyline points="6 9 12 15 18 9" /></svg>
								{`Hidden (${hiddenHostStrategies.length})`}
							</button>
							{#if !collapsedSections.has(`${host}-hidden`)}
								<div class="version-options hidden-options">
									{#each hiddenHostStrategies as s (s.id)}
										<div class="version-row row-hidden">
											<button
												class="version-btn custom-version-btn"
												onclick={() => { toggleStrategyVisibility(s.id); onStrategyChange(s.id); }}
											>
												<span class="custom-dot"></span>
												<span class="strategy-name">{allStrategyInfos.get(s.id)?.name ?? s.label}</span>
											</button>
											<button
												class="row-hide-btn"
												onclick={() => toggleStrategyVisibility(s.id)}
												title="Show"
											>
												<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
											</button>
										</div>
									{/each}
								</div>
							{/if}
						{/if}
					{/if}
				{/each}
				<!-- Managed Endpoints (Live Trading) — shown when any exist -->
				{#if endpointStore.endpoints.length > 0}
					<div class="managed-endpoints-section">
						<div class="version-header" role="button" tabindex="0" onclick={() => toggleCollapse('managed')} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleCollapse('managed'); }}>
							<button class="section-collapse-btn">
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class:collapsed={collapsedSections.has('managed')}><polyline points="6 9 12 15 18 9" /></svg>
							</button>
							<span class="version-type-label">{t('btcUpdown.live.sectionTitle')}</span>
						</div>
						{#if !collapsedSections.has('managed')}
							{@render columnHeaders()}
							{#each endpointStore.endpoints as ep (ep.url + ep.clientId)}
								{@const epKey = `ep:${ep.url}`}
								{@const instances = endpointInstances.get(ep.url) ?? []}
								{@const badge = ep.permissions?.funds ? 'Full' : ep.permissions?.trading ? 'Trading' : ep.permissions?.read ? 'Read' : '...'}
								<div class="ep-group">
									<div class="ep-group-header" role="button" tabindex="0" onclick={() => {
										toggleCollapse(epKey);
										if (!collapsedSections.has(epKey) && instances.length > 0) {
											const first = instances.find((i) => i.status === 'running') ?? instances[0];
											if (first) onStrategyChange(makeInstanceId(ep.url, first.id));
										}
									}} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleCollapse(epKey); }}>
										<button class="section-collapse-btn">
											<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class:collapsed={collapsedSections.has(epKey)}><polyline points="6 9 12 15 18 9" /></svg>
										</button>
										<span class="ep-group-label">{ep.label}</span>
										<span class="ep-meta">
											<span class="ep-badge ep-badge-{badge.toLowerCase()}">{badge}</span>
											{#if ep.credentialId}
												<span class="ep-passkey" title={t('btcUpdown.live.passkeyRegistered')}>K</span>
											{:else if ep.permissions?.trading}
												<button
													class="ep-passkey-btn"
													title={t('btcUpdown.live.registerPasskey')}
													onclick={(e) => { e.stopPropagation(); handleRegisterPasskeyInline(ep); }}
												>+K</button>
											{/if}
										</span>
										<button
											class="ep-remove-btn"
											onclick={(e) => { e.stopPropagation(); endpointStore.removeEndpoint(ep.url, ep.clientId); }}
											title={t('btcUpdown.live.remove')}
										>&times;</button>
									</div>
									{#if !collapsedSections.has(epKey)}
										<div class="version-options">
											{#each instances as inst (inst.id)}
												{@const instStrategyId = makeInstanceId(ep.url, inst.id)}
												{@const instProfits = allStrategyProfits.get(instStrategyId)}
												<div class="version-row">
													<button
														class="version-btn"
														class:active={activeStrategyId === instStrategyId}
														onclick={() => onStrategyChange(instStrategyId)}
													>
														<span class="inst-status-dot inst-status-{inst.status}"></span>
														<span class="strategy-name">{inst.label}</span>
														{#if instProfits}
															{@render profitCells(instProfits)}
														{:else}
															<span class="inst-profit" class:positive={inst.stats.profit > 0} class:negative={inst.stats.profit < 0}>
																{fmtProfit(inst.stats.profit)}
															</span>
														{/if}
													</button>
												</div>
											{/each}
											{#if instances.length === 0}
												<div class="ep-empty">{t('btcUpdown.instance.empty')}</div>
											{/if}
											<button class="sidebar-create-btn" onclick={() => { configuratorEndpoint = ep; }}>
												+ {t('btcUpdown.instance.create')}
											</button>
										</div>
									{/if}
								</div>
							{/each}

							{#if epRegisterError}
								<div class="ep-error">{epRegisterError}</div>
							{/if}
						{/if}
					</div>
				{/if}
			</div>
		</aside>

		<!-- Main content -->
		<div class="main-content">
			<!-- Inline Configurator (takes over main area when active) -->
			{#if configuratorActive && configuratorEndpoint}
				<div class="configurator-area" use:fadeInUp={{ delay: 0 }}>
					<ConfiguratorDrawer
						open={true}
						onClose={() => { configuratorEndpoint = null; }}
						onSave={handleConfiguratorSave}
						{t}
					/>
				</div>
			{:else}
			<!-- Live Endpoint Management (shown when a managed endpoint with trading is active) -->
			{#if showManagementEndpoint?.permissions?.trading && showManagementEndpoint}
				<div class="live-management glass-card" use:fadeInUp={{ delay: 15 }}>
					<StrategyControlPanel endpoint={showManagementEndpoint} {t} onInstanceChange={() => refreshEndpointInstances().then(() => fetchAllStrategyProfits())} onConfiguratorToggle={(open) => { if (open && showManagementEndpoint) configuratorEndpoint = showManagementEndpoint; }} />
				</div>
			{/if}

			<!-- Disclaimer -->
			<div
				class="disclaimer"
				class:disclaimer-live={isLiveMode}
				use:fadeInUp={{ delay: 30 }}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					{#if isLiveMode}
						<path
							d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
						/>
						<line x1="12" y1="9" x2="12" y2="13" />
						<line x1="12" y1="17" x2="12.01" y2="17" />
					{:else}
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					{/if}
				</svg>
				<span
					>{t(
						isLiveMode
							? 'btcUpdown.disclaimer.live'
							: 'btcUpdown.disclaimer.simulation'
					)}</span
				>
			</div>

			<!-- Strategy Info Card -->
			{#if store.strategyInfo}
				<div class="strategy-info glass-card" use:fadeInUp={{ delay: 15 }}>
					<h3 class="strategy-info-name">{store.strategyInfo.name}</h3>
					{#if store.strategyInfo.description?.length}
						<div class="strategy-description">
							<p>{store.strategyInfo.description}</p>
						</div>
					{/if}
					<div class="strategy-summary-grid">
						{#each store.strategyInfo.summary as item (item.label)}
							<div class="strategy-summary-item" class:summary-wide={item.value.length > 20}>
								<span class="strategy-summary-label">{item.label}</span>
								<span class="strategy-summary-value">{item.value}</span>
							</div>
						{/each}
					</div>
					{#if isInstanceId(activeStrategyId) && selectedInstanceEndpoint}
						{@const status = activeInstanceStatus}
						<div class="instance-actions">
							{#if instanceActionError}
								<div class="instance-action-error">{instanceActionError}</div>
							{/if}
							<div class="instance-action-buttons">
								{#if status === 'stopped' || status === 'paused'}
									<button class="btn-instance btn-instance-start" onclick={() => handleInstanceAction('start')} disabled={!!instanceActionLoading}>
										{instanceActionLoading === 'start' ? '...' : t('btcUpdown.instance.start')}
									</button>
								{/if}
								{#if status === 'running'}
									<button class="btn-instance btn-instance-pause" onclick={() => handleInstanceAction('pause')} disabled={!!instanceActionLoading}>
										{instanceActionLoading === 'pause' ? '...' : t('btcUpdown.instance.pause')}
									</button>
									<button class="btn-instance btn-instance-stop" onclick={() => handleInstanceAction('stop')} disabled={!!instanceActionLoading}>
										{instanceActionLoading === 'stop' ? '...' : t('btcUpdown.instance.stop')}
									</button>
								{/if}
								<span class="instance-status-badge" class:status-running={status === 'running'} class:status-paused={status === 'paused'} class:status-stopped={status === 'stopped'}>
									{status ?? 'unknown'}
								</span>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Strategy Control Panel (collapsible, for live mode) -->
			{@const strategyIdForControl = parseEngineUrl(activeStrategy.baseUrl)?.strategyId ?? ''}
			{#if !isInstanceId(activeStrategyId) && parseEngineUrl(activeStrategy.baseUrl) && (isLiveMode ? ['v48','v50','v61','v62','v63','v64'].includes(strategyIdForControl) : ['v80'].includes(strategyIdForControl))}
				<div class="strategy-control glass-card" use:fadeInUp={{ delay: 20 }}>
					<!-- Header: 标题 + 状态 toggle + 展开按钮 -->
					<div class="control-header">
						<button class="control-expand-btn" onclick={() => controlExpanded = !controlExpanded}>
							<span class="expand-arrow" class:expanded={controlExpanded}>&#9654;</span>
							<h3 class="control-title">{t('btcUpdown.control.title')}</h3>
						</button>
						<button
							class="control-toggle"
							class:toggle-on={controlStatus === 'running'}
							class:toggle-off={controlStatus === 'paused'}
							onclick={() => handleControlAction(controlStatus === 'running' ? 'pause' : 'start')}
							disabled={controlLoading || controlStatus === 'unknown'}
						>
							<span class="toggle-track">
								<span class="toggle-thumb"></span>
							</span>
							<span class="toggle-label">
								{controlStatus === 'running' ? t('btcUpdown.control.running') : controlStatus === 'paused' ? t('btcUpdown.control.paused') : '...'}
							</span>
						</button>
					</div>

					{#if controlError}
						<div class="control-error">{controlError}</div>
					{/if}
					{#if controlSuccess}
						<div class="control-success">{controlSuccess}</div>
					{/if}

					{#if controlExpanded}
					<!-- 参数 -->
					<div class="control-params">
						<div class="param-row">
							<label class="param-label">{t('btcUpdown.control.entryAmount')}</label>
							<div class="param-input-group">
								<span class="param-prefix">$</span>
								<input type="number" class="param-input" class:param-dirty={editEntryAmount !== origEntryAmount} bind:value={editEntryAmount} min="1" step="1" />
							</div>
						</div>
						<div class="param-row">
							<label class="param-label">{t('btcUpdown.control.maxBuyPrice')}</label>
							<div class="param-input-group">
								<span class="param-prefix">$</span>
								<input type="number" class="param-input" class:param-dirty={editMaxBuyPrice !== origMaxBuyPrice} bind:value={editMaxBuyPrice} min="0.01" max="0.99" step="0.01" />
							</div>
						</div>

						<!-- 入场窗口（多个，基于剩余秒数范围） -->
						<div class="param-section-label">{t('btcUpdown.control.entryWindow')}</div>
						{#each editEntryWindows as win, i}
							<div class="entry-window-row">
								<span class="ew-label">W{i + 1}</span>
								<input type="number" class="param-input ew-input" bind:value={win.start} min="0" max="300" step="10" />
								<span class="ew-sep">–</span>
								<input type="number" class="param-input ew-input" bind:value={win.end} min="0" max="300" step="10" />
								<span class="ew-unit">s</span>
								{#if editEntryWindows.length > 1}
									<button class="ew-remove" onclick={() => removeEntryWindow(i)}>×</button>
								{/if}
							</div>
						{/each}
						{#if editEntryWindows.length < 3}
							<button class="ew-add" onclick={addEntryWindow}>+ {t('btcUpdown.control.addWindow')}</button>
						{/if}

					</div>

					<!-- 调度：7×24 热力图网格 -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="control-schedule" onpointerup={onDragEnd} onpointerleave={onDragEnd}>
						<div class="schedule-header">
							<div class="schedule-title">{t('btcUpdown.control.schedule')}</div>
							<div class="schedule-actions">
								<button class="sched-btn" onclick={selectAllSchedule}>{t('btcUpdown.control.selectAll')}</button>
								<button class="sched-btn" onclick={clearAllSchedule}>{t('btcUpdown.control.clearAll')}</button>
								<span class="sched-count">{selectedCells}/{totalCells}</span>
							</div>
						</div>
						<div class="sched-tz">{localTz}</div>

						<div class="sched-grid-no-hours">
							<!-- Day headers -->
							{#each DAY_NAMES_EN as dayName, d}
								<button class="sched-day-hdr" onclick={() => toggleDayColumn(d)}>{dayName}</button>
							{/each}

							<!-- 24h × 7d cells -->
							{#each Array.from({ length: HOUR_ROWS }) as _, h}
								{#each Array.from({ length: DAY_COLS }) as _, d}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="sched-cell"
										class:cell-on={scheduleGrid[scheduleIdx(d, h)]}
										onpointerdown={(e) => onCellDown(d, h, e)}
										onpointerenter={() => onCellEnter(d, h)}
										title="{DAY_NAMES_EN[d]} {String(h).padStart(2, '0')}:00"
									></div>
								{/each}
							{/each}
						</div>
					</div>

					<!-- 保存按钮（参数或调度有变化时显示） -->
					{#if paramsDirty}
						<button class="btn-ctrl btn-ctrl-save" onclick={handleSaveParams} disabled={controlLoading}>
							{controlLoading ? '...' : t('btcUpdown.control.saveParams')}
						</button>
					{/if}
					{/if}
				</div>
			{/if}

			<!-- V70 批量买入面板 -->
			{#if isLiveMode && !isInstanceId(activeStrategyId) && isV70Url()}
				<div class="strategy-control glass-card" use:fadeInUp={{ delay: 20 }}>
					<div class="control-header">
						<h3 class="control-title">V70 {t('btcUpdown.v70.title')}</h3>
					</div>

					<!-- 方向选择 -->
					<div class="v70-direction">
						<button class="v70-dir-btn" class:v70-dir-active={v70Direction === 'Up'} class:v70-up={v70Direction === 'Up'} onclick={() => v70Direction = 'Up'}>
							UP
						</button>
						<button class="v70-dir-btn" class:v70-dir-active={v70Direction === 'Down'} class:v70-down={v70Direction === 'Down'} onclick={() => v70Direction = 'Down'}>
							DOWN
						</button>
					</div>

					<!-- 参数 -->
					<div class="control-params">
						<div class="param-row">
							<label class="param-label">{t('btcUpdown.v70.rounds')}</label>
							<input type="number" class="param-input" bind:value={v70Rounds} min="1" max="24" step="1" />
						</div>
						<div class="param-row">
							<label class="param-label">{t('btcUpdown.v70.amount')}</label>
							<div class="param-input-group">
								<span class="param-prefix">$</span>
								<input type="number" class="param-input" bind:value={v70Amount} min="1" step="1" />
							</div>
						</div>
						<div class="param-row">
							<label class="param-label">{t('btcUpdown.v70.maxPrice')}</label>
							<div class="param-input-group">
								<span class="param-prefix">$</span>
								<input type="number" class="param-input" bind:value={v70MaxPrice} min="0.01" max="0.99" step="0.01" />
							</div>
						</div>
					</div>

					<!-- 买入按钮 -->
					<button
						class="v70-buy-btn"
						class:v70-buy-up={v70Direction === 'Up'}
						class:v70-buy-down={v70Direction === 'Down'}
						onclick={handleV70Buy}
						disabled={v70Loading}
					>
						{#if v70Loading}
							{t('btcUpdown.v70.buying')}...
						{:else}
							{t('btcUpdown.v70.buyBtn', { dir: v70Direction, rounds: v70Rounds, total: (v70Rounds * v70Amount).toFixed(0) })}
						{/if}
					</button>

					{#if v70Error}
						<div class="control-error">{v70Error}</div>
					{/if}

					<!-- 结果 -->
					{#if v70Results}
						<div class="v70-results">
							<div class="v70-results-summary">
								{v70Results.filter(r => r.success).length}/{v70Results.length} {t('btcUpdown.v70.filled')}
								· ${v70Results.reduce((s, r) => s + (r.cost ?? 0), 0).toFixed(2)} {t('btcUpdown.v70.spent')}
							</div>
							{#each v70Results as r}
								<div class="v70-result-row" class:v70-result-ok={r.success} class:v70-result-fail={!r.success}>
									<span class="v70-result-slug">{r.slug.replace('btc-updown-5m-', '')}</span>
									{#if r.success}
										<span class="v70-result-fill">{r.shares?.toFixed(1)} @ ${(r.cost! / r.shares!).toFixed(3)}</span>
									{:else}
										<span class="v70-result-err">{r.error}</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Strategy Runtime -->
			{#if store.strategyStartTime}
				<div class="strategy-runtime glass-card" use:fadeInUp={{ delay: 60 }}>
					<div class="runtime-row">
						<span class="runtime-label">{t('btcUpdown.stats.duration')}</span>
						<span class="runtime-value">{formatDuration(store.strategyStartTime, clock.now)}</span>
					</div>
					<div class="runtime-row">
						<span class="runtime-label">{t('btcUpdown.stats.runningSince', { date: '' })}</span>
						<span class="runtime-date">{fmtDateTimeShort(store.strategyStartTime)}</span>
					</div>
				</div>
			{/if}

			<!-- Data section (wrapped for mobile reordering – appears after live feed on mobile) -->
			<div class="main-data">
				<!-- Date Filter -->
				<div class="date-filter glass-card" use:fadeInUp={{ delay: 40 }}>
					<DatePicker
						mode="range"
						bind:value={store.filterDate}
						onchange={onDateChange}
						presets={['today', '7d', '30d', '90d']}
						navigation
						max={todayLocal()}
					/>
				</div>

				<!-- Stats Overview -->
				{#if store.stats}
					<StatsGrid
						stats={store.stats}
						selectedHour={store.selectedHour}
						ctx={getFormatterCtx()}
						{t}
						onClearHour={() => { store.selectHour(null); }}
						wallet={isLiveMode ? store.wallet : null}
						polymarketStats={isLiveMode ? store.polymarketStats : null}
					/>
				{/if}

				<!-- Hourly Profit Chart (single day) -->
				{#if store.isSingleDayFilter}
					<HourlyChart
						hourlyData={store.hourlyData}
						filterDateFrom={store.filterDate.from}
						selectedHour={store.selectedHour}
						ctx={getFormatterCtx()}
						{t}
						onSelectHour={(hour) => { store.selectHour(hour); }}
					/>
				{/if}

				<!-- Multi-day analysis: Weekday + Aggregated Hourly -->
				{#if store.isMultiDayFilter}
					<WeekdayChart
						dailyData={store.dailyData}
						ctx={getFormatterCtx()}
						{t}
					/>
					<HourlyChart
						hourlyData={store.hourlyData}
						filterDateFrom={store.filterDate.from}
						selectedHour={store.selectedHour}
						ctx={getFormatterCtx()}
						{t}
						titleKey="btcUpdown.chart.hourlyProfitAgg"
						onSelectHour={(hour) => { store.selectHour(hour); }}
					/>
				{/if}

				<!-- ===== Round History / Live Feed ===== -->
				<div class="history-header">
					<div class="history-tabs">
						<button
							class="history-tab"
							class:active={historyTab === 'rounds'}
							onclick={() => {
								historyTab = 'rounds';
							}}
						>
							{t('btcUpdown.tabHistory')}
						</button>
						<button
							class="history-tab"
							class:active={historyTab === 'live'}
							onclick={() => {
								historyTab = 'live';
							}}
						>
							{t('btcUpdown.tabLive')}
							{#if store.connectionStatus === 'connected'}
								<span class="tab-live-dot"></span>
							{/if}
						</button>
					</div>
				</div>
				{#if historyTab === 'rounds'}
					<RoundsHistory
						rounds={store.rounds}
						roundsTotal={store.roundsTotal}
						roundsPage={store.roundsPage}
						roundsPageSize={store.roundsPageSize}
						refreshing={store.roundsRefreshing}
						roundsFilter={store.roundsFilter}
						resultFilter={store.resultFilter}
						stats={store.stats}
						ctx={getFormatterCtx()}
						{t}
						{formatCurrency}
						onPageChange={(page) => { store.setPage(page); }}
						onFilterChange={(f) => store.setFilter(f)}
						onResultFilterChange={(f) => store.setResultFilter(f)}
						onRefresh={() => store.refresh()}
					/>
				{:else}
					<LiveFeed
						currentRound={store.currentRound}
						priceToBeat={store.priceToBeat}
						events={store.events}
						connectionStatus={store.connectionStatus}
						ctx={getFormatterCtx()}
						{t}
						{formatNumber}
						{formatCurrency}
						{getEventMessage}
					/>
				{/if}
			</div>
			<!-- /.main-data -->
		{/if}
		</div>
		<!-- /.main-content -->
	</div>
	<!-- /.page-layout -->

	<!-- Add Custom Strategy Modal -->
	<AddStrategyModal
		open={showAddStrategy}
		urlInput={customUrlInput}
		urlError={customUrlError}
		validating={customUrlValidating}
		{validationSteps}
		{t}
		onClose={() => { showAddStrategy = false; customUrlError = ''; validationSteps = []; }}
		onSubmit={addCustomStrategy}
		onUrlChange={(v) => { customUrlInput = v; }}
	/>
</main>

<PageFooter />

<style>
	main.page {
		max-width: 960px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-6);
		min-height: calc(100vh - 200px);
	}

	/* Page layout */
	.page-layout {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.sidebar {
		display: none;
	}
	.sidebar.mobile-drawer-open {
		display: flex;
		flex-direction: column;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 100;
		max-height: 70vh;
		background: var(--bg-base);
		border-top-left-radius: var(--radius-xl);
		border-top-right-radius: var(--radius-xl);
		box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 var(--space-4) var(--space-6);
		animation: drawer-slide-up 0.3s var(--easing-smooth);
	}
	/* Remove glass-card border/shadow inside drawer — the drawer itself is the container */
	.sidebar.mobile-drawer-open .version-selector {
		background: none;
		border: none;
		box-shadow: none;
		backdrop-filter: none;
		/* padding: 0; */
		margin-bottom: 0;
	}
	@keyframes drawer-slide-up {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}
	.mobile-drawer-backdrop {
		display: none;
	}
	.mobile-drawer-fab {
		display: flex;
	}
	.mobile-drawer-handle {
		display: flex;
	}
	@media (max-width: 1279px) {
		.mobile-drawer-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 99;
			background: rgba(0, 0, 0, 0.4);
			backdrop-filter: blur(2px);
		}
	}
	.main-content {
		display: contents;
	}
	.main-data {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* 2-column: sidebar sticky col 1, content in col 2 */
	@media (min-width: 1280px) {
		main.page {
			max-width: 1320px;
		}
		.page-layout {
			display: grid;
			grid-template-columns: 380px 1fr;
			gap: var(--space-4) var(--space-6);
			align-items: start;
		}
		.sidebar {
			display: flex;
			flex-direction: column;
			grid-column: 1;
			grid-row: 1 / span 20;
			position: sticky;
			top: 150px;
			max-height: calc(100vh - 150px - var(--space-6));
			overflow-y: auto;
			scrollbar-width: thin;
			scrollbar-color: rgba(255, 255, 255, 0.08) transparent;
		}
		.sidebar::-webkit-scrollbar {
			width: 4px;
		}
		.sidebar::-webkit-scrollbar-thumb {
			background: rgba(255, 255, 255, 0.1);
			border-radius: 2px;
		}
		.main-content {
			display: flex;
			flex-direction: column;
			gap: var(--space-4);
			grid-column: 2;
		}
		.sidebar .version-selector {
			margin-bottom: 0;
		}
		.mobile-drawer-fab {
			display: none !important;
		}
		.mobile-drawer-backdrop {
			display: none !important;
		}
		.mobile-drawer-handle {
			display: none !important;
		}
	}

	/* Mobile drawer FAB */
	.mobile-drawer-fab {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		position: fixed;
		bottom: var(--space-6);
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
		padding: var(--space-3) var(--space-5);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		box-shadow: var(--shadow-lg);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: transform var(--motion-fast) var(--easing), box-shadow var(--motion-fast) var(--easing);
		max-width: calc(100vw - var(--space-12));
		backdrop-filter: blur(12px) saturate(180%);
	}
	.mobile-drawer-fab:active {
		transform: translateX(-50%) scale(0.97);
		box-shadow: var(--shadow-sm);
	}
	.mobile-fab-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Mobile drawer handle */
	.mobile-drawer-handle {
		display: none;
		justify-content: center;
		padding: var(--space-3) 0 var(--space-2);
		cursor: grab;
		position: sticky;
		top: 0;
		background: var(--bg-raised);
		z-index: 1;
	}
	.drawer-handle-bar {
		width: 36px;
		height: 4px;
		border-radius: var(--radius-full);
		background: var(--fg-faint);
	}

	/* Header */
	.page-header {
		margin-bottom: var(--space-6);
	}
	@media (min-width: 1280px) {
		.page-header {
			position: sticky;
			top: 60px;
			z-index: var(--z-sticky, 10);
			background: var(--bg-base);
			padding-bottom: var(--space-4);
			margin-bottom: var(--space-2);
		}
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin-bottom: var(--space-2);
	}

	.page-title {
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		margin: 0;
		line-height: 1.2;
	}

	.page-description {
		font-size: var(--text-base);
		color: var(--fg-muted);
		margin: 0;
	}

	/* Status Badge */
	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		border: 1px solid;
		flex-shrink: 0;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.status-connected {
		border-color: rgba(52, 211, 153, 0.3);
		color: #34d399;
		background: rgba(52, 211, 153, 0.08);
	}
	.status-connected .status-dot {
		background: #34d399;
		animation: breathe 2.5s ease-in-out infinite;
	}

	.status-connecting,
	.status-reconnecting {
		border-color: rgba(251, 191, 36, 0.3);
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.08);
	}
	.status-connecting .status-dot,
	.status-reconnecting .status-dot {
		background: #fbbf24;
		animation: blink 1s ease-in-out infinite;
	}

	.status-disconnected {
		border-color: rgba(248, 113, 113, 0.3);
		color: #f87171;
		background: rgba(248, 113, 113, 0.08);
	}
	.status-disconnected .status-dot {
		background: #f87171;
	}

	@keyframes breathe {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 0.7;
		}
	}
	@keyframes blink {
		0%,
		100% {
			opacity: 0.4;
		}
		50% {
			opacity: 1;
		}
	}

	/* Version Selector */
	.version-selector {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-4);

	}
	.version-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		cursor: pointer;
	}
	.version-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}
	.version-type-label {
		font-size: calc(10px * var(--text-scale, 1));
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		opacity: 0.6;
	}
	.custom-header {
		margin-top: var(--space-1);
	}
	.host-label {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
		text-transform: none;
		letter-spacing: 0;
		font-family: var(--font-mono, monospace);
	}
	.version-options {
		display: flex;
		gap: var(--space-1);
		flex-direction: column;
	}
	.version-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		white-space: nowrap;
		width: 100%;
		text-align: left;
	}
	.version-btn:hover {
		border-color: var(--border-base);
		color: var(--fg-muted);
	}
	.version-btn.active {
		background: rgba(255, 255, 255, 0.06);
		border-color: var(--accent);
		color: var(--fg-base);
		font-weight: var(--weight-semibold);
		box-shadow: inset 3px 0 0 var(--accent);
	}

	/* Strategy name + profits layout */
	.strategy-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.profit-column-labels {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) calc(var(--space-3) + 1px);
		padding-right: calc(var(--space-3) + 1px + 24px); /* +24px to account for row-hide-btn */
		margin-bottom: 2px;
		background: var(--bg-sunken, rgba(255, 255, 255, 0.03));
		border-radius: var(--radius-md);
	}
	.profit-col-labels-right {
		margin-left: auto;
		display: flex;
		gap: var(--space-1); /* match .strategy-profits gap */
		flex-shrink: 0;
	}
	.name-col-label {
		text-transform: none;
		letter-spacing: 0;
	}
	.profit-col-nav {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 64px;
		flex-shrink: 0;
		gap: 0;
	}
	.col-nav-btn-v {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: 20px;
		padding: 2px 0;
		background: none;
		border: none;
		color: var(--fg-subtle);
		cursor: pointer;
		opacity: 0.4;
		transition:
			opacity 0.15s,
			background 0.15s;
		border-radius: var(--radius-sm);
	}
	.col-nav-btn-v:active:not(:disabled) {
		background: rgba(255, 255, 255, 0.06);
	}
	.col-nav-btn-v:hover:not(:disabled) {
		opacity: 0.8;
	}
	.col-nav-btn-v:disabled {
		opacity: 0.1;
		cursor: default;
	}
	.profit-col-label {
		font-size: 11px;
		font-weight: var(--weight-semibold);
		color: var(--fg-subtle);
		opacity: 0.65;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		text-align: center;
		flex-shrink: 0;
		white-space: nowrap;
		user-select: none;
		cursor: pointer;
		padding: 4px 2px;
		border-radius: var(--radius-sm);
		transition:
			opacity 0.15s,
			background 0.15s;
	}
	.profit-col-label:hover {
		opacity: 0.9;
		background: rgba(255, 255, 255, 0.04);
	}
	.profit-col-label.offset-active {
		color: var(--accent, #60a5fa);
		opacity: 0.9;
		cursor: pointer;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 2px;
	}
	.profit-col-label.sort-active {
		color: var(--accent, #60a5fa);
		opacity: 0.8;
		cursor: pointer;
	}
	.sort-indicator {
		font-size: calc(10px * var(--text-scale, 1));
		margin-left: 2px;
		opacity: 0.8;
	}
	.strategy-profits {
		margin-left: auto;
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		font-size: calc(10px * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
		opacity: 0.85;
		flex-shrink: 0;
	}
	.version-btn.active .strategy-profits {
		opacity: 1;
		font-size: calc(11px * var(--text-scale, 1));
	}
	.profit-cell {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		width: 64px;
		flex-shrink: 0;
		gap: 1px;
	}
	.profit-val {
		white-space: nowrap;
	}
	.profit-val.positive {
		color: #34d399;
	}
	.profit-val.negative {
		color: #f87171;
	}
	.profit-status {
		font-size: calc(9px * var(--text-scale, 1));
		color: var(--fg-subtle);
		opacity: 0.6;
	}
	.profit-status.pending {
		color: #fbbf24;
		opacity: 1;
	}
	.profit-dir {
		font-size: calc(9px * var(--text-scale, 1));
		margin-left: 1px;
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
	}
	.profit-meta {
		font-size: calc(8px * var(--text-scale, 1));
		color: var(--fg-subtle);
		opacity: 0.5;
		white-space: nowrap;
	}

	/* Last refresh timestamp */
	.last-refresh-time {
		font-size: calc(9px * var(--text-scale, 1));
		color: var(--fg-subtle);
		opacity: 0.4;
		font-variant-numeric: tabular-nums;
		margin-left: auto;
		white-space: nowrap;
	}

	/* Refresh button */
	.profit-refresh-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		flex-shrink: 0;
	}
	.profit-refresh-btn:hover {
		color: var(--fg-muted);
		background: rgba(255, 255, 255, 0.06);
	}
	.profit-refresh-btn.refreshing svg {
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Custom strategy elements */
	.host-remove-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		opacity: 0;
		flex-shrink: 0;
		transition: all var(--motion-fast) var(--easing);
	}
	.custom-header:hover .host-remove-btn {
		opacity: 0.5;
	}
	.host-remove-btn:hover {
		opacity: 1 !important;
		color: #ef4444;
		background: rgba(239, 68, 68, 0.1);
	}
	.version-row {
		display: flex;
		align-items: center;
		gap: 2px;
		/* Reserve space for hide button so profits always align, even on active row */
		padding-right: 24px;
		position: relative;
	}
	.version-row .version-btn {
		flex: 1;
		min-width: 0;
	}
	.row-hide-btn {
		position: absolute;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-faint);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity 0.15s var(--easing),
			color 0.15s var(--easing),
			background 0.15s var(--easing);
	}
	.version-row:hover .row-hide-btn {
		opacity: 0.6;
	}
	.row-hide-btn:hover {
		opacity: 1 !important;
		color: var(--fg-subtle);
		background: rgba(255, 255, 255, 0.06);
	}
	.version-row.row-hidden {
		opacity: 0.35;
	}
	.version-row.row-hidden .row-hide-btn {
		opacity: 0.6;
	}
	.version-row.row-hidden:hover {
		opacity: 0.6;
	}
	.section-collapse-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		transition: color 0.15s var(--easing);
	}
	.section-collapse-btn:hover {
		color: var(--fg-base);
	}
	.section-collapse-btn svg {
		transition: transform 0.2s var(--easing);
	}
	.section-collapse-btn svg.collapsed {
		transform: rotate(-90deg);
	}
	.custom-version-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.custom-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
		flex-shrink: 0;
	}
	/* Section config button (gear icon) */
	.section-config-btn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 4px 8px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		opacity: 0.6;
		transition:
			opacity 0.15s,
			color 0.15s,
			border-color 0.15s;
	}
	.section-config-btn:hover {
		opacity: 1;
		color: var(--fg-muted);
	}
	.section-config-btn.has-hidden {
		opacity: 0.7;
	}
	.config-count {
		font-size: calc(9px * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
		color: var(--fg-subtle);
		opacity: 0.5;
	}
	.config-count.has-hidden {
		opacity: 0.8;
		color: var(--fg-muted);
	}

	.config-batch-actions {
		display: flex;
		gap: var(--space-2);
		padding: 0 var(--space-2);
		margin-bottom: var(--space-1);
	}
	.config-batch-btn {
		font-size: calc(9px * var(--text-scale, 1));
		padding: 3px 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		white-space: nowrap;
	}
	.config-batch-btn:hover {
		border-color: rgba(255, 255, 255, 0.2);
		color: var(--fg-muted);
		background: rgba(255, 255, 255, 0.04);
	}
	/* Hidden strategies toggle */
	.hidden-section-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		background: none;
		border: none;
		cursor: pointer;
		width: 100%;
		transition: color var(--motion-fast) var(--easing);
	}
	.hidden-section-toggle:hover {
		color: var(--fg-muted);
	}
	.hidden-options {
		opacity: 0.6;
	}
	.config-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 3px var(--space-2);
		border-radius: var(--radius-sm);
		transition: opacity 0.15s;
	}
	.config-row.config-hidden {
		opacity: 0.4;
	}
	.config-name {
		flex: 1;
		min-width: 0;
		font-size: var(--text-xs);
		color: var(--fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.config-tag {
		font-size: 9px;
		color: var(--fg-subtle);
		opacity: 0.5;
		flex-shrink: 0;
	}
	.config-toggle-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		opacity: 0.5;
		transition:
			opacity 0.15s,
			color 0.15s,
			background 0.15s;
	}
	.config-toggle-btn:hover {
		opacity: 1;
		color: var(--fg-default);
		background: rgba(255, 255, 255, 0.06);
	}

	/* (old .add-strategy-btn removed — replaced by .add-strategy-btn-top) */

	/* Disclaimer variants */
	.disclaimer-live {
		background: rgba(239, 68, 68, 0.08);
		border-color: rgba(239, 68, 68, 0.2);
	}
	.disclaimer-live svg {
		color: #ef4444;
	}

	/* Strategy Info */
	/* Strategy Control Panel */
	.strategy-control {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-2);
	}
	.control-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-3);
	}
	.control-expand-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}
	.expand-arrow {
		font-size: 10px;
		color: var(--fg-subtle);
		transition: transform 0.2s;
		display: inline-block;
	}
	.expand-arrow.expanded { transform: rotate(90deg); }
	.control-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0;
	}
	/* Toggle switch */
	.control-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}
	.control-toggle:disabled { opacity: 0.5; cursor: not-allowed; }
	.toggle-track {
		position: relative;
		width: 40px;
		height: 22px;
		border-radius: 11px;
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		transition: background 0.2s, border-color 0.2s;
	}
	.toggle-on .toggle-track {
		background: var(--success, #34d399);
		border-color: var(--success, #34d399);
	}
	.toggle-off .toggle-track {
		background: var(--warning, #fbbf24);
		border-color: var(--warning, #fbbf24);
	}
	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		transition: transform 0.2s;
		box-shadow: 0 1px 3px rgba(0,0,0,0.2);
	}
	.toggle-on .toggle-thumb { transform: translateX(18px); }
	.toggle-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.toggle-on .toggle-label { color: var(--success); }
	.toggle-off .toggle-label { color: var(--warning); }

	.control-error {
		font-size: var(--text-xs);
		color: var(--error);
		padding: var(--space-1) var(--space-2);
		margin-bottom: var(--space-2);
		border-radius: var(--radius-sm);
		background: rgba(248, 113, 113, 0.1);
	}
	.control-success {
		font-size: var(--text-xs);
		color: var(--success);
		padding: var(--space-1) var(--space-2);
		margin-bottom: var(--space-2);
		border-radius: var(--radius-sm);
		background: rgba(52, 211, 153, 0.1);
		animation: fadeInSuccess 0.3s ease;
	}
	@keyframes fadeInSuccess { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
	.btn-ctrl {
		font-size: var(--text-xs);
		padding: var(--space-1) var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid;
		background: transparent;
		cursor: pointer;
		font-weight: var(--weight-medium);
		transition: all 0.15s ease;
	}
	.btn-ctrl:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn-ctrl-save { border-color: var(--accent); color: var(--accent); width: 100%; margin-top: var(--space-2); }
	.btn-ctrl-save:hover:not(:disabled) { background: var(--accent); color: var(--accent-fg, #fff); }
	.control-params {
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-3);
	}
	.param-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-2);
	}
	.param-label {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.param-input-group {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.param-prefix {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.param-input {
		width: 80px;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-base);
		background: var(--bg-sunken);
		color: var(--fg-base);
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		text-align: right;
		outline: none;
	}
	.param-input:focus { border-color: var(--accent); }
	.param-suffix, .ew-unit, .ew-sep {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.param-dirty { border-color: var(--warning) !important; background: rgba(251, 191, 36, 0.05); }

	/* V70 Batch Buy */
	.v70-direction {
		display: flex;
		gap: 4px;
		margin-bottom: var(--space-3);
	}
	.v70-dir-btn {
		flex: 1;
		padding: var(--space-2);
		border-radius: var(--radius-md);
		border: 2px solid var(--border-base);
		background: var(--bg-sunken);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-bold);
		cursor: pointer;
		transition: all 0.15s ease;
		letter-spacing: 0.1em;
	}
	.v70-dir-active.v70-up {
		border-color: var(--success);
		background: rgba(52, 211, 153, 0.1);
		color: var(--success);
	}
	.v70-dir-active.v70-down {
		border-color: var(--error);
		background: rgba(248, 113, 113, 0.1);
		color: var(--error);
	}
	.v70-buy-btn {
		width: 100%;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		border: none;
		font-size: var(--text-sm);
		font-weight: var(--weight-bold);
		cursor: pointer;
		transition: all 0.15s ease;
		margin-top: var(--space-2);
		letter-spacing: 0.02em;
	}
	.v70-buy-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.v70-buy-up {
		background: var(--success);
		color: white;
	}
	.v70-buy-up:hover:not(:disabled) { filter: brightness(1.1); }
	.v70-buy-down {
		background: var(--error);
		color: white;
	}
	.v70-buy-down:hover:not(:disabled) { filter: brightness(1.1); }
	.v70-results {
		margin-top: var(--space-3);
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-2);
	}
	.v70-results-summary {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin-bottom: var(--space-2);
	}
	.v70-result-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 2px 0;
		font-size: 11px;
		font-family: var(--font-mono);
	}
	.v70-result-ok { color: var(--success); }
	.v70-result-fail { color: var(--fg-subtle); }
	.v70-result-slug { color: var(--fg-muted); }
	.v70-result-err { color: var(--error); font-size: 10px; }
	.param-section-label {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		margin-top: var(--space-2);
		margin-bottom: var(--space-1);
	}
	.entry-window-row {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 4px;
	}
	.ew-label {
		font-size: 10px;
		color: var(--fg-subtle);
		font-family: var(--font-mono);
		min-width: 20px;
	}
	.ew-input { width: 55px; }
	.ew-remove {
		background: none;
		border: none;
		color: var(--fg-subtle);
		cursor: pointer;
		font-size: 14px;
		padding: 0 4px;
		line-height: 1;
	}
	.ew-remove:hover { color: var(--error); }
	.ew-add {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		background: none;
		border: 1px dashed var(--border-base);
		border-radius: var(--radius-sm);
		padding: 2px 8px;
		cursor: pointer;
		margin-top: 2px;
	}
	.ew-add:hover { color: var(--accent); border-color: var(--accent); }
	/* Schedule Grid */
	.control-schedule {
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-3);
		margin-top: var(--space-3);
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}
	.schedule-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-2);
	}
	.schedule-title {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.schedule-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.sched-btn {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-base);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
	}
	.sched-btn:hover { color: var(--fg-base); border-color: var(--border-strong); }
	.sched-count {
		font-size: 10px;
		color: var(--fg-subtle);
		font-family: var(--font-mono);
	}
	.sched-tz {
		font-size: 10px;
		color: var(--fg-subtle);
		margin-bottom: var(--space-1);
		font-family: var(--font-mono);
	}
	.sched-grid-no-hours {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}
	.sched-day-hdr {
		font-size: 11px;
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
		text-align: center;
		padding: 6px 0;
		background: none;
		border: none;
		cursor: pointer;
	}
	.sched-day-hdr:hover { color: var(--fg-base); }
	.sched-cell {
		height: 20px;
		border-radius: 3px;
		background: var(--bg-sunken);
		border: 1px solid transparent;
		cursor: pointer;
		transition: background 0.08s;
		-webkit-tap-highlight-color: transparent;
	}
	.sched-cell:hover {
		border-color: var(--fg-subtle);
	}
	.cell-on {
		background: var(--success, #34d399);
	}
	@media (max-width: 480px) {
		.sched-grid-no-hours { gap: 1px; }
		.sched-cell { height: 16px; border-radius: 2px; }
	}

	.strategy-info {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-2);
	}
	.strategy-info-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-2);
	}
	.strategy-description {
		margin-bottom: var(--space-3);
	}
	.strategy-description p {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		margin: 0;
		line-height: 1.5;
	}
	.strategy-description p + p {
		margin-top: var(--space-1);
	}
	.strategy-summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: var(--space-2);
		margin-top: 24px;
	}
	.strategy-summary-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.strategy-summary-item.summary-wide {
		grid-column: 1 / -1;
	}
	.strategy-summary-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.strategy-summary-value {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	/* Instance actions in strategy info card */
	.instance-actions {
		margin-top: var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border-subtle);
	}
	.instance-action-error {
		font-size: var(--text-xs);
		color: var(--error);
		margin-bottom: var(--space-2);
	}
	.instance-action-buttons {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.btn-instance {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		background: transparent;
		color: var(--fg-base);
	}
	.btn-instance:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.06);
	}
	.btn-instance:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn-instance-start {
		color: var(--success);
		border-color: rgba(34, 197, 94, 0.3);
	}
	.btn-instance-stop {
		color: var(--error);
		border-color: rgba(239, 68, 68, 0.3);
	}
	.btn-instance-pause {
		color: var(--warning);
		border-color: rgba(251, 191, 36, 0.3);
	}
	.instance-status-badge {
		margin-left: auto;
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.status-running { color: var(--success); background: rgba(34, 197, 94, 0.1); }
	.status-paused { color: var(--warning); background: rgba(251, 191, 36, 0.1); }
	.status-stopped { color: var(--fg-subtle); background: rgba(255, 255, 255, 0.05); }

	/* Disclaimer */
	.disclaimer {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		background: rgba(251, 191, 36, 0.06);
		border: 1px solid rgba(251, 191, 36, 0.12);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-2);
	}
	.disclaimer svg {
		color: #fbbf24;
		flex-shrink: 0;
	}

	/* Date Filter */
	.date-filter {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-2);
	}
	.date-filter-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}

	/* Strategy Runtime */
	.strategy-runtime {
		display: flex;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-radius: var(--radius-lg);
		/* margin-bottom: var(--space-6); */
	}

	.runtime-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.runtime-label {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
	}

	.runtime-value {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.runtime-date {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	/* Live sidebar & History headers */
	.history-header {
		margin-bottom: var(--space-3);
	}
	.history-tabs {
		display: flex;
		gap: var(--space-1);
	}
	.history-tab {
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.history-tab:hover {
		color: var(--fg-base);
	}
	.history-tab.active {
		color: var(--fg-base);
		border-bottom-color: var(--accent, #60a5fa);
	}
	.tab-live-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #34d399;
		display: inline-block;
	}

	/* Direction Tag */
	.direction-tag {
		font-size: var(--text-sm);
		font-weight: var(--weight-bold);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
	}
	.direction-up,
	.direction-down {
		color: var(--fg-muted);
		background: rgba(255, 255, 255, 0.06);
	}

	/* Positive/Negative */
	.positive {
		color: #34d399;
	}
	.negative {
		color: #f87171;
	}

	/* Glass Card */
	.glass-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	/* Light mode overrides */
	:global([data-theme='light']) .glass-card {
		background: rgba(0, 0, 0, 0.02);
		border: 1px solid rgba(0, 0, 0, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}
	:global([data-theme='light']) .positive {
		color: #059669;
	}
	:global([data-theme='light']) .negative {
		color: #dc2626;
	}
	:global([data-theme='light']) .direction-up,
	:global([data-theme='light']) .direction-down {
		color: var(--fg-muted);
		background: rgba(0, 0, 0, 0.05);
	}
	:global([data-theme='light']) .status-connected {
		border-color: rgba(16, 185, 129, 0.3);
		color: #059669;
		background: rgba(16, 185, 129, 0.06);
	}
	:global([data-theme='light']) .status-connected .status-dot {
		background: #059669;
	}
	:global([data-theme='light']) .disclaimer {
		background: rgba(217, 119, 6, 0.06);
		border-color: rgba(217, 119, 6, 0.15);
	}
	:global([data-theme='light']) .disclaimer svg {
		color: #d97706;
	}
	:global([data-theme='light']) .version-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .version-btn.active {
		background: rgba(0, 0, 0, 0.04);
		border-color: var(--accent);
	}
	:global([data-theme='light']) .profit-val.positive {
		color: #059669;
	}
	:global([data-theme='light']) .profit-val.negative {
		color: #dc2626;
	}
	:global([data-theme='light']) .profit-status.pending {
		color: #d97706;
	}
	:global([data-theme='light']) .profit-refresh-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .config-count.has-hidden {
		color: var(--fg-subtle);
	}
	:global([data-theme='light']) .config-toggle-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .disclaimer-live {
		background: rgba(220, 38, 38, 0.06);
		border-color: rgba(220, 38, 38, 0.15);
	}
	:global([data-theme='light']) .disclaimer-live svg {
		color: #dc2626;
	}
	:global([data-theme='light']) .sidebar {
		scrollbar-color: rgba(0, 0, 0, 0.08) transparent;
	}
	:global([data-theme='light']) .sidebar::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.1);
	}

	/* Responsive */
	@media (max-width: 768px) {
		main.page {
			padding: var(--space-6) var(--space-4);
		}
		.page-title {
			font-size: var(--text-2xl);
		}
		.strategy-runtime {
			flex-direction: column;
			gap: var(--space-2);
		}
		/* Mobile touch targets - min 44px per Apple HIG */
		.version-btn {
			padding: var(--space-2) var(--space-3);
			min-height: 44px;
		}
		.profit-refresh-btn {
			width: 36px;
			height: 36px;
		}
		.profit-col-label {
			font-size: 12px;
			padding: 8px 4px;
		}
		.col-nav-btn-v {
			min-height: 36px;
			padding: 6px 0;
		}
		.profit-cell {
			width: 68px;
		}
		.profit-col-nav {
			width: 68px;
		}
		.strategy-profits {
			gap: var(--space-1);
		}
		.profit-column-labels {
			gap: var(--space-1);
		}
		.section-config-btn {
			padding: 6px 10px;
			font-size: 11px;
		}
		.config-toggle-btn {
			width: 36px;
			height: 36px;
		}
		.config-row {
			padding: var(--space-1) var(--space-2);
			min-height: 40px;
		}
		.config-batch-btn {
			font-size: 11px;
			padding: 6px 12px;

			
		}
		.row-hide-btn {
			opacity: 0.4;
			width: 24px;
			height: 24px;
		}
		/* Date filter: stacked layout on mobile */
		.date-filter {
			flex-direction: column;
			align-items: stretch;
			gap: var(--space-2);
			padding: var(--space-3);
		}
		.date-filter-label {
			display: none;
		}
	}

	/* Top add strategy button (prominent, next to title) */
	.add-strategy-btn-top {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
		padding: 3px 10px;
		border-radius: var(--radius-full);
		border: 1px solid var(--accent);
		background: var(--accent-subtle);
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.add-strategy-btn-top:hover {
		background: var(--accent);
		color: var(--accent-fg);
	}

	/* Managed endpoints section in sidebar */
	.managed-endpoints-section {
		margin-top: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border-subtle);
	}
	.ep-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.ep-row {
		display: flex;
		align-items: center;
		border-radius: var(--radius-md);
		transition: background var(--motion-fast) var(--easing);
	}
	.ep-row.ep-active {
		background: rgba(255, 255, 255, 0.06);
	}
	.ep-select-btn {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
		min-width: 0;
		font-size: var(--text-xs);
	}
	.ep-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--success);
		flex-shrink: 0;
	}
	.ep-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--fg-base);
		font-weight: var(--weight-medium);
		font-size: var(--text-xs);
	}
	.ep-meta {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-shrink: 0;
		margin-left: auto;
	}
	.ep-badge {
		font-size: 9px;
		padding: 1px 4px;
		border-radius: var(--radius-sm);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.ep-badge-read { background: var(--info-muted); color: var(--info); }
	.ep-badge-trading { background: var(--warning-muted); color: var(--warning); }
	.ep-badge-full { background: var(--success-muted); color: var(--success); }
	.ep-passkey {
		font-size: 9px;
		font-weight: var(--weight-bold);
		font-family: var(--font-mono);
		color: var(--success);
	}
	.ep-passkey-btn {
		font-size: 9px;
		padding: 1px 3px;
		border-radius: var(--radius-sm);
		border: none;
		background: var(--accent-muted);
		color: var(--accent);
		cursor: pointer;
		font-weight: var(--weight-bold);
		font-family: var(--font-mono);
	}
	.ep-passkey-btn:hover {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.ep-remove-btn {
		padding: 2px 4px;
		background: none;
		border: none;
		color: var(--fg-faint);
		cursor: pointer;
		font-size: var(--text-sm);
		line-height: 1;
		transition: color var(--motion-fast) var(--easing);
	}
	.ep-remove-btn:hover { color: var(--error); }
	.ep-error {
		font-size: var(--text-xs);
		color: var(--error);
		padding: var(--space-1) var(--space-2);
	}
	.ep-group {
		margin-bottom: var(--space-1);
	}
	.ep-group-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
		cursor: pointer;
	}
	.ep-group-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--fg-base);
		font-weight: var(--weight-medium);
		font-size: var(--text-xs);
	}
	.ep-empty {
		font-size: var(--text-xs);
		color: var(--fg-faint);
		padding: var(--space-1) var(--space-4);
		font-style: italic;
	}
	.sidebar-create-btn {
		width: 100%;
		padding: var(--space-1) var(--space-4);
		background: none;
		border: 1px dashed var(--border-subtle);
		border-radius: var(--radius-md);
		color: var(--fg-muted);
		font-size: var(--text-xs);
		cursor: pointer;
		margin-top: var(--space-1);
		transition: all var(--motion-fast) var(--easing);
	}
	.sidebar-create-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.configurator-area {
		padding: var(--space-4) 0;
	}
	.inst-status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		display: inline-block;
	}
	.inst-status-running { background: var(--success); }
	.inst-status-stopped { background: var(--fg-faint); }
	.inst-status-paused { background: var(--warning); }
	.inst-status-error { background: var(--error); }
	.inst-profit {
		margin-left: auto;
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
		flex-shrink: 0;
	}
	.inst-profit.positive { color: var(--success); }
	.inst-profit.negative { color: var(--error); }

	/* Live management panel in main content */
	.live-management {
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		margin-bottom: var(--space-4);
	}
</style>
