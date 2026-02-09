import type { LoadEvent, ServerLoadEvent } from '@sveltejs/kit';
import { loadMessages, setMessageLoader, setRouteMessages } from '../core/loader.js';
import { i18nState } from '../core/state.svelte.js';
import type { Messages, RouteMessages } from '../core/types.js';

export interface LoadOptions {
  /** 消息加载器 */
  messageLoader?: (locale: string, namespace: string) => Promise<Messages>;
  /** 路由消息映射 */
  routeMessages?: RouteMessages;
}

/**
 * 配置 load 函数
 */
export function configureLoad(options: LoadOptions) {
  if (options.messageLoader) {
    setMessageLoader(options.messageLoader);
  }
  if (options.routeMessages) {
    setRouteMessages(options.routeMessages);
  }
}

/**
 * 创建通用 load 函数
 */
export function createLoad(options: LoadOptions = {}) {
  // 应用配置
  configureLoad(options);

  return async ({ url, parent }: LoadEvent | ServerLoadEvent) => {
    // 从 parent 获取 locale (由 hook 设置)
    const parentData = await parent?.();
    const locale = (parentData as any)?.locale ?? i18nState.locale;

    // 加载消息
    const messages = await loadMessages(url.pathname, locale);

    return {
      locale,
      messages,
    };
  };
}

/**
 * 服务端 load 函数 (用于 +layout.server.ts)
 */
export async function serverLoad({ locals, url }: ServerLoadEvent) {
  const locale = locals.locale ?? i18nState.config.defaultLocale;
  const messages = await loadMessages(url.pathname, locale);

  return {
    locale,
    messages,
  };
}
