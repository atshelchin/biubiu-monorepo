import {
  createI18n,
  setMessageLoader,
  enableProductionDevTools,
  disableProductionDevTools,
  isProductionDevToolsEnabled,
  initDevTools,
  localizeHref as _localizeHref,
} from '@shelchin/i18n';
// Auto-generated types and route messages from Vite plugin
import type { TranslationKey, InterpolateParams } from '$i18n';
import { routeMessages } from '$i18n/routes';

// 客户端消息加载器
async function clientMessageLoader(locale: string, namespace: string) {
  try {
    const module = await import(`../messages/${locale}/${namespace}.json`);
    return module.default;
  } catch {
    console.warn(`[i18n] Message file not found: ${locale}/${namespace}`);
    return {};
  }
}

// 设置消息加载器
setMessageLoader(clientMessageLoader);

export const i18n = createI18n({
  defaultLocale: 'zh',
  fallbackLocale: 'en',
  preferences: {
    locale: 'zh',
    numberLocale: 'zh-CN',
    currency: 'CNY',
    dateLocale: 'zh-CN',
    timezone: 'Asia/Shanghai',
  },
  messageLoader: clientMessageLoader,
  routeMessages,
  devTools: {
    repoUrl: 'https://github.com/atshelchin/biubiu-monorepo',
    repoMessagesPath: 'apps/i18n-demo/src/messages',
    branch: 'main',
  },
});

const {
  t: _t,
  locale,
  preferences,
  formatNumber,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  parseNumber,
} = i18n;

// 类型安全的翻译函数
export const t = _t as (key: TranslationKey, params?: InterpolateParams) => string;

export { locale, preferences, formatNumber, formatCurrency, formatDate, formatDateTime, formatRelativeTime, parseNumber };

// 导出生产环境 DevTools 控制函数
export { enableProductionDevTools, disableProductionDevTools, isProductionDevToolsEnabled };

// 导出 localizeHref (封装当前项目的 locale 配置)
export const localizeHref = (path: string) => _localizeHref(path);

/**
 * 初始化生产环境 DevTools (带 lineIndex)
 * 在生产环境中，调用此函数后才能使用 Alt+Click 跳转到 GitHub
 */
export async function initProductionDevTools(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    // 动态加载 lineIndex
    const module = await import('$i18n/line-index');

    // 重新初始化 DevTools (带 lineIndex)
    initDevTools({
      repoUrl: 'https://github.com/atshelchin/biubiu-monorepo',
      repoMessagesPath: 'apps/i18n-demo/src/messages',
      branch: 'main',
      lineIndex: module.lineIndex,
    });

    return true;
  } catch (e) {
    console.warn('[i18n] Failed to load lineIndex for production DevTools');
    return false;
  }
}
