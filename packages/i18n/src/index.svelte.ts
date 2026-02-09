// Core
export { i18nState, preferences, locale } from './core/state.svelte.js';
export { t, createT } from './core/translator.js';
export {
  loadMessages,
  matchRoute,
  setRouteMessages,
  setMessageLoader,
  clearMessageCache,
  preloadMessages,
} from './core/loader.js';
export type {
  Preferences,
  I18nConfig,
  Messages,
  RouteMessages,
  LineIndex,
  InterpolateParams,
} from './core/types.js';

// URL Utils
export {
  localizeHref,
  extractLocaleFromPathname,
  removeLocaleFromPathname,
} from './utils/localized-url.js';

// Format
export {
  formatNumber,
  formatCurrency,
  formatPercent,
  formatBigInt,
  type NumberFormatOptions,
} from './format/number.js';
export {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  getTimezoneDate,
  type DateFormatOptions,
} from './format/date.js';
export {
  parseNumber,
  parseNumberToFloat,
  parseNumberToBigInt,
  isValidLocalizedNumber,
  maskNumberInput,
} from './format/parse.js';

// DevTools
export {
  initDevTools,
  destroyDevTools,
  enableProductionDevTools,
  disableProductionDevTools,
  isProductionDevToolsEnabled,
  openSourceByKey,
  openSourceByElement,
  i18nKey,
  type DevToolsConfig,
  type OpenSourceResult,
} from './devtools/click-handler.js';

// Factory
import { i18nState, preferences, locale } from './core/state.svelte.js';
import { t } from './core/translator.js';
import { setMessageLoader, setRouteMessages } from './core/loader.js';
import { formatNumber, formatCurrency } from './format/number.js';
import { formatDate, formatDateTime, formatRelativeTime } from './format/date.js';
import { parseNumber } from './format/parse.js';
import { initDevTools } from './devtools/click-handler.js';
import { createHandle } from './sveltekit/hook.js';
import { createLoad } from './sveltekit/load.js';
import type { I18nConfig, Messages, RouteMessages, LineIndex } from './core/types.js';

export interface CreateI18nOptions extends I18nConfig {
  /** 消息加载器 */
  messageLoader?: (locale: string, namespace: string) => Promise<Messages>;
  /** 路由消息映射 (由 Vite 插件生成) */
  routeMessages?: RouteMessages;
  /** DevTools 配置 */
  devTools?: {
    /** GitHub/GitLab 仓库 URL */
    repoUrl?: string;
    /** 消息文件在仓库中的路径前缀 */
    repoMessagesPath?: string;
    /** 分支名 (默认: main) */
    branch?: string;
    /** 行号索引 (生产模式跳转 GitHub 需要) */
    lineIndex?: LineIndex;
  };
}

/**
 * 创建 i18n 实例
 */
export function createI18n(options: CreateI18nOptions) {
  // 初始化配置
  i18nState.init(options);

  // 设置消息加载器
  if (options.messageLoader) {
    setMessageLoader(options.messageLoader);
  }

  // 设置路由映射
  if (options.routeMessages) {
    setRouteMessages(options.routeMessages);
  }

  // 初始化 DevTools
  if (typeof window !== 'undefined') {
    initDevTools(options.devTools);
  }

  return {
    // State
    locale,
    preferences,

    // Translation
    t,

    // Format
    formatNumber,
    formatCurrency,
    formatDate,
    formatDateTime,
    formatRelativeTime,

    // Parse
    parseNumber,

    // SvelteKit integration
    handle: (handleOptions?: Parameters<typeof createHandle>[0]) =>
      createHandle(handleOptions),
    load: createLoad({
      messageLoader: options.messageLoader,
      routeMessages: options.routeMessages,
    }),
  };
}
