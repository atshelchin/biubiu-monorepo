/**
 * WalletPair 复制链接 i18n 回归测试。
 *
 * 类型生成的参考 locale 是 readdir 的第一个目录（不是 en），
 * 任何 locale 缺 key 都会破坏 $i18n 类型或运行时露出裸 key，
 * 所以这里强制所有 locale 的 auth.connect.* 与 en 完全对齐。
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const messagesDir = fileURLToPath(new URL('../../messages', import.meta.url));

const locales = readdirSync(messagesDir).filter((d) =>
	statSync(join(messagesDir, d)).isDirectory()
);

function globalMessages(locale: string): Record<string, string> {
	return JSON.parse(readFileSync(join(messagesDir, locale, '_global.json'), 'utf-8'));
}

describe('walletpair copy-link i18n', () => {
	it('discovers all locales', () => {
		expect(locales.length).toBeGreaterThanOrEqual(15);
		expect(locales).toContain('en');
		expect(locales).toContain('zh');
	});

	it.each(locales)('%s has non-empty copyLink/copied keys', (locale) => {
		const msgs = globalMessages(locale);
		expect(msgs['auth.connect.copyLink']).toBeTypeOf('string');
		expect(msgs['auth.connect.copyLink']!.length).toBeGreaterThan(0);
		expect(msgs['auth.connect.copied']).toBeTypeOf('string');
		expect(msgs['auth.connect.copied']!.length).toBeGreaterThan(0);
	});

	it.each(locales)('%s auth.connect.* keys match en exactly', (locale) => {
		const enKeys = Object.keys(globalMessages('en'))
			.filter((k) => k.startsWith('auth.connect.'))
			.sort();
		const keys = Object.keys(globalMessages(locale))
			.filter((k) => k.startsWith('auth.connect.'))
			.sort();
		expect(keys).toEqual(enKeys);
	});
});
