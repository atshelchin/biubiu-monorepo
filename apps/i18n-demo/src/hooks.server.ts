import { redirect, type Handle } from '@sveltejs/kit';
import { i18nState, setMessageLoader, setRouteMessages, matchRoute } from '@shelchin/i18n-sveltekit';
import { routeMessages } from '$i18n/routes';

const SUPPORTED_LOCALES = ['zh', 'en', 'de', 'es', 'ja', 'pt'];
const DEFAULT_LOCALE = 'zh';

// 设置路由消息映射 (服务端初始化)
setRouteMessages(routeMessages);

// 服务端消息加载器
async function serverMessageLoader(locale: string, namespace: string) {
  try {
    // 服务端直接读取 JSON 文件
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const messagesDir = join(process.cwd(), 'src/messages');
    const filePath = join(messagesDir, locale, `${namespace}.json`);
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    // 尝试 fallback
    if (locale !== 'en') {
      return serverMessageLoader('en', namespace);
    }
    return {};
  }
}

// 设置服务端消息加载器
setMessageLoader(serverMessageLoader);

// 加载并合并消息
async function loadAndMergeMessages(locale: string, namespaces: string[]) {
  const messages: Record<string, string> = {};
  for (const ns of namespaces) {
    const nsMessages = await serverMessageLoader(locale, ns);
    Object.assign(messages, nsMessages);
  }
  i18nState.setMessages(messages);
}

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;

  // 获取 URL 中的 locale
  const pathParts = pathname.split('/').filter(Boolean);
  const pathLocale = pathParts[0];

  // 如果访问根路径或没有有效 locale，重定向到默认语言
  if (!pathLocale || !SUPPORTED_LOCALES.includes(pathLocale)) {
    // 尝试从 cookie 或 Accept-Language 获取首选语言
    const cookieLocale = event.cookies.get('locale');
    const acceptLanguage = event.request.headers.get('accept-language');
    let preferredLocale = DEFAULT_LOCALE;

    if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)) {
      preferredLocale = cookieLocale;
    } else if (acceptLanguage) {
      // Parse Accept-Language header
      const langMatch = acceptLanguage.match(/^([a-z]{2})/i);
      if (langMatch && SUPPORTED_LOCALES.includes(langMatch[1].toLowerCase())) {
        preferredLocale = langMatch[1].toLowerCase();
      }
    }

    // 重定向到带 locale 的路径
    throw redirect(302, `/${preferredLocale}${pathname}`);
  }

  // 设置 locale
  const locale = pathLocale;
  event.locals.locale = locale;
  i18nState.locale = locale;

  // 设置 cookie
  event.cookies.set('locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: 'lax',
  });

  // 获取实际的路由路径 (去掉 locale 前缀)
  const routePath = '/' + pathParts.slice(1).join('/') || '/';

  // 使用 matchRoute 自动匹配命名空间 (支持动态路由)
  const namespaces = matchRoute(routePath);

  // 加载消息
  await loadAndMergeMessages(locale, namespaces);

  // 处理请求
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      return html.replace('%lang%', locale);
    },
  });

  return response;
};
