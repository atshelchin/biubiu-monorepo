import { i18nState } from './state.svelte.js';
import type { Messages, RouteMessages } from './types.js';

/** 路由消息映射 (由 Vite 插件生成) */
let routeMessages: RouteMessages = {};

/** 消息缓存 */
const messageCache = new Map<string, Messages>();

/** 消息加载函数类型 */
type MessageLoader = (locale: string, namespace: string) => Promise<Messages>;

/** 默认消息加载器 */
let messageLoader: MessageLoader = async () => ({});

/**
 * 设置路由消息映射
 */
export function setRouteMessages(routes: RouteMessages) {
  routeMessages = routes;
}

/**
 * 设置消息加载器
 */
export function setMessageLoader(loader: MessageLoader) {
  messageLoader = loader;
}

/**
 * 将路由模式转换为正则表达式
 * 支持: [param], [[optional]], [...rest], (group)
 *
 * /user/[id] → /^\/user\/([^/]+)\/?$/
 * /user/[[optional]] → /^\/user(?:\/([^/]+))?\/?$/
 * /files/[...path] → /^\/files(?:\/(.+))?\/?$/
 * /dashboard/(admin)/settings → /^\/dashboard\/settings\/?$/
 */
function patternToRegex(pattern: string): RegExp {
  const segments = pattern.split('/').filter(Boolean);
  let regexStr = '^';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Rest 参数 [...param] - 匹配剩余所有
    if (segment.startsWith('[...') && segment.endsWith(']')) {
      regexStr += '(?:/(.+))?';
      break; // rest 参数必须是最后一个
    }

    // 可选参数 [[param]]
    if (segment.startsWith('[[') && segment.endsWith(']]')) {
      regexStr += '(?:/([^/]+))?';
      continue;
    }

    // 动态参数 [param]
    if (segment.startsWith('[') && segment.endsWith(']')) {
      regexStr += '/([^/]+)';
      continue;
    }

    // 分组路由 (group) - 在 URL 中不存在，跳过
    if (segment.startsWith('(') && segment.endsWith(')')) {
      continue;
    }

    // 静态段
    regexStr += '/' + segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 允许尾部斜杠
  regexStr += '/?$';

  return new RegExp(regexStr);
}

/**
 * 计算模式的匹配优先级分数（越高越具体）
 * 静态段 > 动态参数 > 可选参数 > rest 参数
 */
function calculatePatternScore(pattern: string): number {
  const segments = pattern.split('/').filter(Boolean);
  let score = 0;

  for (const segment of segments) {
    if (segment.startsWith('[...')) {
      score += 1; // rest 参数得分最低
    } else if (segment.startsWith('[[')) {
      score += 2; // 可选参数
    } else if (segment.startsWith('[')) {
      score += 3; // 动态参数
    } else if (!segment.startsWith('(')) {
      score += 4; // 静态段得分最高
    }
    // 分组路由不计分
  }

  // 路径越长越具体
  score += segments.filter((s) => !s.startsWith('(')).length * 0.1;

  return score;
}

/**
 * 匹配路由，返回需要加载的命名空间列表
 * 支持完整的 SvelteKit 路由模式
 */
export function matchRoute(pathname: string): string[] {
  // 标准化路径
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/$/, '');

  // 1. 精确匹配
  if (routeMessages[normalizedPath]) {
    return routeMessages[normalizedPath];
  }

  // 2. 动态路由匹配 - 收集所有匹配，选择最佳
  const matches: Array<{ pattern: string; score: number }> = [];

  for (const pattern of Object.keys(routeMessages)) {
    // 跳过不包含动态部分的模式（已经精确匹配过了）
    if (!pattern.includes('[') && !pattern.includes('(')) {
      continue;
    }

    const regex = patternToRegex(pattern);
    if (regex.test(normalizedPath)) {
      matches.push({
        pattern,
        score: calculatePatternScore(pattern),
      });
    }
  }

  // 按分数降序排序，返回最佳匹配
  if (matches.length > 0) {
    matches.sort((a, b) => b.score - a.score);
    return routeMessages[matches[0].pattern];
  }

  // 3. 返回全局命名空间
  return ['_global'];
}

/**
 * 加载指定命名空间的消息
 */
async function loadNamespace(locale: string, namespace: string): Promise<Messages> {
  const cacheKey = `${locale}:${namespace}`;

  if (messageCache.has(cacheKey)) {
    return messageCache.get(cacheKey)!;
  }

  try {
    const messages = await messageLoader(locale, namespace);
    messageCache.set(cacheKey, messages);
    return messages;
  } catch (e) {
    // 尝试 fallback locale
    if (locale !== i18nState.config.fallbackLocale) {
      return loadNamespace(i18nState.config.fallbackLocale, namespace);
    }
    console.warn(`[i18n] Failed to load: ${locale}/${namespace}`);
    return {};
  }
}

/**
 * 根据路由加载所有需要的消息
 */
export async function loadMessages(pathname: string, locale?: string): Promise<Messages> {
  const targetLocale = locale ?? i18nState.locale;
  const namespaces = matchRoute(pathname);

  const results = await Promise.all(
    namespaces.map((ns) => loadNamespace(targetLocale, ns))
  );

  // 合并所有消息，后面的覆盖前面的
  const merged = results.reduce((acc, msgs) => ({ ...acc, ...msgs }), {});

  // 更新全局状态
  i18nState.setMessages(merged);
  i18nState.locale = targetLocale;

  return merged;
}

/**
 * 清除缓存
 */
export function clearMessageCache() {
  messageCache.clear();
}

/**
 * 预加载消息 (用于 SSR)
 */
export async function preloadMessages(
  pathname: string,
  locale: string
): Promise<Messages> {
  return loadMessages(pathname, locale);
}
