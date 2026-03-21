/**
 * 浏览器兼容性检测。
 *
 * WebAuthn P-256 签名在部分 OEM 浏览器上有兼容性问题（如小米浏览器），
 * 可能导致签名验证失败、资金无法操作。
 * 只允许经过验证的浏览器进行注册和充值操作。
 */

/** 经过验证的浏览器列表 */
const SUPPORTED_BROWSERS = [
	'Chrome',
	'Safari',
	'Edge',
	'Firefox',
	'Brave',
	'Opera',
	'Samsung Internet'
] as const;

export type SupportedBrowser = (typeof SUPPORTED_BROWSERS)[number];

export interface BrowserInfo {
	name: string;
	supported: boolean;
}

/** 检测当前浏览器 */
export function detectBrowser(): BrowserInfo {
	if (typeof navigator === 'undefined') return { name: 'Unknown', supported: false };

	const ua = navigator.userAgent;

	// 检测顺序很重要 — 很多浏览器 UA 里包含 "Chrome"
	// 先检测特殊的，再检测通用的

	// Brave (has navigator.brave)
	if ((navigator as Record<string, unknown>).brave) {
		return { name: 'Brave', supported: true };
	}

	// Samsung Internet
	if (/SamsungBrowser/i.test(ua)) {
		return { name: 'Samsung Internet', supported: true };
	}

	// 国产浏览器 / 不兼容浏览器 — 必须在 Chrome 之前检测
	if (/MiuiBrowser|XiaoMi/i.test(ua)) return { name: 'Xiaomi Browser', supported: false };
	if (/HuaweiBrowser/i.test(ua)) return { name: 'Huawei Browser', supported: false };
	if (/UCBrowser/i.test(ua)) return { name: 'UC Browser', supported: false };
	if (/QQBrowser/i.test(ua)) return { name: 'QQ Browser', supported: false };
	if (/MicroMessenger/i.test(ua)) return { name: 'WeChat', supported: false };
	if (/DingTalk/i.test(ua)) return { name: 'DingTalk', supported: false };
	if (/Quark/i.test(ua)) return { name: 'Quark', supported: false };
	if (/VivoBrowser/i.test(ua)) return { name: 'Vivo Browser', supported: false };
	if (/OppoBrowser/i.test(ua)) return { name: 'OPPO Browser', supported: false };

	// Edge (Chromium-based, UA contains "Edg/")
	if (/Edg\//i.test(ua)) return { name: 'Edge', supported: true };

	// Opera (UA contains "OPR/")
	if (/OPR\//i.test(ua)) return { name: 'Opera', supported: true };

	// Firefox
	if (/Firefox/i.test(ua) && !/Seamonkey/i.test(ua)) {
		return { name: 'Firefox', supported: true };
	}

	// Safari (must check before Chrome — Chrome UA also contains "Safari")
	if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
		return { name: 'Safari', supported: true };
	}

	// Chrome (generic — after all Chromium-based browsers)
	if (/Chrome/i.test(ua)) return { name: 'Chrome', supported: true };

	return { name: 'Unknown', supported: false };
}

/** 浏览器是否支持 */
export function isBrowserSupported(): boolean {
	return detectBrowser().supported;
}
