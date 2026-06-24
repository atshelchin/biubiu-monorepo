import { describe, it, expect } from 'vitest';
import { buildInviteUrl, newRoomId, parseInvite, relayUrl } from './relay.js';

describe('newRoomId', () => {
	it('matches the relay-accepted shape', () => {
		expect(newRoomId()).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
	});

	it('is unique across calls', () => {
		const ids = new Set(Array.from({ length: 100 }, () => newRoomId()));
		expect(ids.size).toBe(100);
	});
});

describe('parseInvite', () => {
	it('parses a well-formed fragment (with or without leading #)', () => {
		expect(parseInvite('#r=abc123&k=PUBKEY')).toEqual({ roomId: 'abc123', creatorPub: 'PUBKEY' });
		expect(parseInvite('r=abc123&k=PUBKEY')).toEqual({ roomId: 'abc123', creatorPub: 'PUBKEY' });
	});

	it('returns null when a part is missing or empty', () => {
		expect(parseInvite('#r=abc')).toBeNull();
		expect(parseInvite('#k=only')).toBeNull();
		expect(parseInvite('')).toBeNull();
		expect(parseInvite('#')).toBeNull();
	});

	it('round-trips with buildInviteUrl', () => {
		const url = buildInviteUrl('/apps/chat', 'rOOm_42', 'KEYabc-_');
		const hash = url.slice(url.indexOf('#'));
		expect(parseInvite(hash)).toEqual({ roomId: 'rOOm_42', creatorPub: 'KEYabc-_' });
	});
});

describe('buildInviteUrl', () => {
	it('encodes room + key into the fragment under the given path', () => {
		const url = buildInviteUrl('/apps/chat', 'room1', 'pub1');
		// No window.location in node → falls back to the production origin.
		expect(url).toBe('https://biubiu.tools/apps/chat#r=room1&k=pub1');
	});
});

describe('relayUrl', () => {
	it('targets the connect endpoint with the room as a query param', () => {
		const url = relayUrl('my room/1');
		expect(url).toContain('/v1/connect?room=');
		expect(url).toContain(encodeURIComponent('my room/1'));
		expect(url).toMatch(/^wss?:\/\//);
	});
});
