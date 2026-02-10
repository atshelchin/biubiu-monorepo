import type { Handle, RequestEvent } from '@sveltejs/kit';
import { i18nState } from '../core/state.svelte.js';
import { preloadMessages } from '../core/loader.js';

export interface HandleOptions {
  /** 语言检测函数 */
  detectLocale?: (event: RequestEvent) => string | Promise<string>;
  /** Cookie 名称 */
  cookieName?: string;
  /** Cookie 有效期 (秒) */
  cookieMaxAge?: number;
}

/**
 * 默认语言检测
 * 优先级: URL path > Cookie > Accept-Language > defaultLocale
 */
function defaultDetectLocale(
  event: RequestEvent,
  cookieName: string,
  defaultLocale: string,
  supportedLocales: string[]
): string {
  const { url, cookies, request } = event;

  // 1. URL path (如 /zh/dashboard)
  const pathLocale = url.pathname.split('/')[1];
  if (supportedLocales.includes(pathLocale)) {
    return pathLocale;
  }

  // 2. Cookie
  const cookieLocale = cookies.get(cookieName);
  if (cookieLocale && supportedLocales.includes(cookieLocale)) {
    return cookieLocale;
  }

  // 3. Accept-Language header
  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    const preferred = acceptLanguage.split(',')[0].split('-')[0];
    const matched = supportedLocales.find(
      (l) => l.startsWith(preferred) || l.split('-')[0] === preferred
    );
    if (matched) return matched;
  }

  // 4. Fallback
  return defaultLocale;
}

/**
 * 创建 SvelteKit handle hook
 */
export function createHandle(options: HandleOptions = {}): Handle {
  const cookieName = options.cookieName ?? 'locale';
  const cookieMaxAge = options.cookieMaxAge ?? 60 * 60 * 24 * 365; // 1 year

  return async ({ event, resolve }) => {
    const { defaultLocale, fallbackLocale } = i18nState.config;

    // 获取支持的 locales (从路由映射推断或配置)
    const supportedLocales = [defaultLocale, fallbackLocale].filter(Boolean);

    // 检测语言
    let locale: string;
    if (options.detectLocale) {
      locale = await options.detectLocale(event);
    } else {
      locale = defaultDetectLocale(event, cookieName, defaultLocale, supportedLocales);
    }

    // 设置 cookie
    event.cookies.set(cookieName, locale, {
      path: '/',
      maxAge: cookieMaxAge,
      httpOnly: false, // 允许客户端读取
      sameSite: 'lax',
    });

    // 设置到 locals 供 load 函数使用
    event.locals.locale = locale;

    // 预加载消息
    await preloadMessages(event.url.pathname, locale);

    // 继续处理请求
    const response = await resolve(event, {
      transformPageChunk: ({ html }) => {
        // 注入 lang 属性
        return html.replace('%lang%', locale).replace('<html', `<html lang="${locale}"`);
      },
    });

    return response;
  };
}

// 扩展 App.Locals 类型
declare global {
  namespace App {
    interface Locals {
      locale: string;
    }
  }
}
