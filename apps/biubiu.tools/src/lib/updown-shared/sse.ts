// SSE connection manager for Up/Down prediction dashboards

import { SSE_EVENT_TYPES } from './constants.js';

export interface SSECallbacks {
	onEvent: (eventType: string, data: Record<string, unknown>, timestamp: string) => void;
	onStatusChange: (status: 'connecting' | 'connected' | 'disconnected') => void;
}

interface ConnRef {
	es: EventSource | null;
	reader: ReadableStreamDefaultReader<Uint8Array> | null;
	abortController: AbortController | null;
	timer: ReturnType<typeof setTimeout> | null;
}

export interface SSEManager {
	connect: () => void;
	disconnect: () => void;
}

export function createSSEManager(
	getSseUrl: () => string,
	isCustomStrategy: () => boolean,
	callbacks: SSECallbacks
): SSEManager {
	const connRef: ConnRef = {
		es: null,
		reader: null,
		abortController: null,
		timer: null
	};

	function connectViaEventSource(sseUrl: string) {
		const es = new EventSource(sseUrl);
		connRef.es = es;

		es.onopen = () => {
			callbacks.onStatusChange('connected');
		};

		for (const eventType of SSE_EVENT_TYPES) {
			es.addEventListener(eventType, (e: MessageEvent) => {
				try {
					const parsed = JSON.parse(e.data);
					callbacks.onEvent(
						eventType,
						parsed.data ?? parsed,
						parsed.timestamp ?? new Date().toISOString()
					);
				} catch {
					// ignore parse errors
				}
			});
		}

		es.onerror = () => {
			callbacks.onStatusChange('disconnected');
			connRef.es?.close();
			connRef.es = null;
			if (isCustomStrategy() && !connRef.reader) {
				connectViaProxy(sseUrl);
				return;
			}
			connRef.timer = setTimeout(() => {
				connRef.timer = null;
				connect();
			}, 3000);
		};
	}

	async function connectViaProxy(sseUrl: string) {
		callbacks.onStatusChange('connecting');
		const proxyUrl = `/api/proxy?url=${encodeURIComponent(sseUrl)}`;
		try {
			const controller = new AbortController();
			connRef.abortController = controller;
			const res = await fetch(proxyUrl, { signal: controller.signal });
			if (!res.body) return;
			connRef.reader = res.body.getReader();
			callbacks.onStatusChange('connected');
			const decoder = new TextDecoder();
			let buffer = '';
			while (true) {
				const { done, value } = await connRef.reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				let currentEvent = '';
				for (const line of lines) {
					if (line.startsWith('event: ')) {
						currentEvent = line.slice(7).trim();
					} else if (line.startsWith('data: ') && currentEvent) {
						try {
							const parsed = JSON.parse(line.slice(6));
							callbacks.onEvent(
								currentEvent,
								parsed.data ?? parsed,
								parsed.timestamp ?? new Date().toISOString()
							);
						} catch {
							/* ignore */
						}
						currentEvent = '';
					} else if (line.trim() === '') {
						currentEvent = '';
					}
				}
			}
		} catch {
			// Connection closed or aborted
		}
		if (connRef.reader || connRef.abortController) {
			connRef.reader = null;
			connRef.abortController = null;
			callbacks.onStatusChange('disconnected');
			connRef.timer = setTimeout(() => {
				connRef.timer = null;
				connect();
			}, 3000);
		}
	}

	function connect() {
		disconnect();
		callbacks.onStatusChange('connecting');
		const sseUrl = getSseUrl();
		connectViaEventSource(sseUrl);
	}

	function disconnect() {
		if (connRef.timer) {
			clearTimeout(connRef.timer);
			connRef.timer = null;
		}
		if (connRef.es) {
			connRef.es.close();
			connRef.es = null;
		}
		if (connRef.reader) {
			connRef.reader.cancel();
			connRef.reader = null;
		}
		if (connRef.abortController) {
			connRef.abortController.abort();
			connRef.abortController = null;
		}
		callbacks.onStatusChange('disconnected');
	}

	return { connect, disconnect };
}
