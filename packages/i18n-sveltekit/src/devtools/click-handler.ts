import { i18nState } from '../core/state.svelte.js';
import type { LineIndex } from '../core/types.js';

export interface DevToolsConfig {
  /** GitHub/GitLab 仓库 URL */
  repoUrl?: string;
  /** 消息文件在仓库中的路径前缀 */
  repoMessagesPath?: string;
  /** 分支名 (默认: main) */
  branch?: string;
  /** 行号索引 (生产模式需要) */
  lineIndex?: LineIndex;
}

let config: DevToolsConfig = {};
let initialized = false;
let productionModeEnabled = false;

/**
 * 初始化开发工具
 * 可多次调用以更新配置（例如后续添加 lineIndex）
 */
export function initDevTools(options: DevToolsConfig = {}) {
  if (typeof window === 'undefined') return;

  // 合并配置（允许后续更新）
  config = { ...config, ...options };

  const isDev = import.meta.env?.DEV;

  // 首次初始化
  if (!initialized) {
    initialized = true;

    // 开发模式：直接启用
    if (isDev) {
      document.addEventListener('click', handleAltClick);

      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const keyName = isMac ? 'Option (⌥)' : 'Alt';
      console.log(`[i18n] DevTools enabled. ${keyName}+Click on translated text to open source.`);
    }
  }

  // 生产模式：配置就绪时提示
  if (!isDev && config.repoUrl && config.lineIndex && !productionModeEnabled) {
    console.log('[i18n] Production DevTools ready. Call enableProductionDevTools() to enable GitHub navigation.');
  }
}

/**
 * 启用生产模式开发工具 (GitHub 跳转)
 * 需要在控制台调用或通过 UI 开关调用
 */
export function enableProductionDevTools() {
  if (typeof window === 'undefined') return;
  if (import.meta.env?.DEV) {
    console.log('[i18n] Already in development mode.');
    return;
  }
  if (!config.repoUrl || !config.lineIndex) {
    console.warn('[i18n] Production DevTools requires repoUrl and lineIndex config.');
    return;
  }

  if (productionModeEnabled) {
    console.log('[i18n] Production DevTools already enabled.');
    return;
  }

  productionModeEnabled = true;
  document.addEventListener('click', handleAltClick);

  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const keyName = isMac ? 'Option (⌥)' : 'Alt';
  console.log(`[i18n] Production DevTools enabled. ${keyName}+Click to open GitHub source.`);
}

/**
 * 禁用生产模式开发工具
 */
export function disableProductionDevTools() {
  if (typeof window === 'undefined') return;
  if (import.meta.env?.DEV) return;

  if (!productionModeEnabled) return;

  productionModeEnabled = false;
  document.removeEventListener('click', handleAltClick);
  console.log('[i18n] Production DevTools disabled.');
}

/**
 * 检查生产模式开发工具是否启用
 */
export function isProductionDevToolsEnabled(): boolean {
  return productionModeEnabled;
}

/**
 * 处理 Alt+Click 事件
 */
async function handleAltClick(e: MouseEvent) {
  if (!e.altKey) return;

  const target = e.target as HTMLElement;

  // 查找带有 data-i18n-key 属性的元素
  const keyElement = target.closest('[data-i18n-key]') as HTMLElement | null;
  const key = keyElement?.dataset.i18nKey;

  if (!key) {
    // 尝试从文本内容反向查找
    const text = target.textContent?.trim();
    if (text) {
      const foundKey = findKeyByText(text);
      if (foundKey) {
        e.preventDefault();
        await openSource(foundKey);
        return;
      }
    }
    return;
  }

  e.preventDefault();
  await openSource(key);
}

/**
 * 根据翻译文本反向查找 key
 * 支持精确匹配和插值模板匹配
 */
function findKeyByText(text: string): string | null {
  const messages = i18nState.messages;

  // 1. 精确匹配
  for (const [key, value] of Object.entries(messages)) {
    if (value === text) {
      return key;
    }
  }

  // 2. 模板匹配：将 {placeholder} 转换为正则匹配
  for (const [key, value] of Object.entries(messages)) {
    // 跳过复数形式的模板
    if (value.includes('{') && !value.includes(', plural,')) {
      // 转义特殊字符，将 {xxx} 转换为 (.+)
      const pattern = value
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\{\\w+\\}/g, '.+');

      try {
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(text)) {
          return key;
        }
      } catch {
        // 正则无效，跳过
      }
    }
  }

  // 3. 部分匹配：查找包含该文本的模板（用于复数等）
  for (const [key, value] of Object.entries(messages)) {
    // 检查文本是否是模板的一部分（去除插值后）
    const templateWithoutInterpolation = value.split(/\{[^}]+\}/)[0]?.trim();
    if (templateWithoutInterpolation && text.startsWith(templateWithoutInterpolation)) {
      return key;
    }
  }

  return null;
}

export interface OpenSourceResult {
  success: boolean;
  key: string;
  locale: string;
  /** 文件路径（相对路径） */
  file?: string;
  /** 行号 */
  line?: number;
  /** 完整 URL（仅生产模式） */
  url?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 编程式打开源文件
 * @param key - i18n key
 * @param options - 可选配置
 * @returns 操作结果，包含是否成功、文件位置等信息
 *
 * @example
 * ```ts
 * // 基本用法
 * const result = await openSourceByKey('nav.home');
 * if (result.success) {
 *   console.log(`Opened ${result.file}:${result.line}`);
 * } else {
 *   console.log(`Failed: ${result.error}`);
 * }
 *
 * // 自定义触发（如右键菜单）
 * element.addEventListener('contextmenu', async (e) => {
 *   e.preventDefault();
 *   const key = element.dataset.i18nKey;
 *   if (key) {
 *     await openSourceByKey(key);
 *   }
 * });
 * ```
 */
export async function openSourceByKey(
  key: string,
  options: { locale?: string; openInNewTab?: boolean } = {}
): Promise<OpenSourceResult> {
  const locale = options.locale ?? i18nState.locale;
  const result: OpenSourceResult = { success: false, key, locale };

  // 检查 key 是否存在于当前消息中
  if (!i18nState.messages[key]) {
    result.error = `Key "${key}" not found in current messages`;
    return result;
  }

  if (import.meta.env?.DEV) {
    // 开发模式：通过 Vite server 打开 VS Code
    try {
      const response = await fetch('/__i18n_open_source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, locale }),
      });

      const data = await response.json();

      if (data.success) {
        result.success = true;
        result.file = data.file;
        result.line = data.line;
      } else {
        result.error = `Key not found in source: ${key}`;
      }
    } catch (err) {
      result.error = `Failed to open source: ${err}`;
    }
  } else if (config.repoUrl && config.lineIndex) {
    // 生产模式：跳转到 GitHub
    const messagesPath = config.repoMessagesPath ?? 'src/messages';
    const branch = config.branch ?? 'main';

    const localeIndex = config.lineIndex[locale];
    const keyInfo = localeIndex?.[key];

    if (keyInfo) {
      const { file, line } = keyInfo;
      const url = `${config.repoUrl}/blob/${branch}/${messagesPath}/${locale}/${file}#L${line}`;

      result.success = true;
      result.file = file;
      result.line = line;
      result.url = url;

      // 默认打开新标签页
      if (options.openInNewTab !== false) {
        window.open(url, '_blank');
      }
    } else {
      result.error = `Key "${key}" not found in lineIndex for locale "${locale}"`;
    }
  } else {
    result.error = 'DevTools not configured (missing repoUrl or lineIndex)';
  }

  return result;
}

/**
 * 根据 DOM 元素查找 i18n key 并打开源文件
 * @param element - 要检查的 DOM 元素
 * @returns 操作结果
 *
 * @example
 * ```ts
 * // 自定义触发（如长按）
 * let pressTimer: number;
 * element.addEventListener('touchstart', () => {
 *   pressTimer = setTimeout(async () => {
 *     const result = await openSourceByElement(element);
 *     if (!result.success) {
 *       alert('This is not a translated text');
 *     }
 *   }, 500);
 * });
 * element.addEventListener('touchend', () => clearTimeout(pressTimer));
 * ```
 */
export async function openSourceByElement(
  element: HTMLElement,
  options: { locale?: string; openInNewTab?: boolean } = {}
): Promise<OpenSourceResult> {
  // 1. 尝试从 data-i18n-key 属性获取
  const keyElement = element.closest('[data-i18n-key]') as HTMLElement | null;
  const key = keyElement?.dataset.i18nKey;

  if (key) {
    return openSourceByKey(key, options);
  }

  // 2. 尝试从文本内容反向查找
  const text = element.textContent?.trim();
  if (text) {
    const foundKey = findKeyByText(text);
    if (foundKey) {
      return openSourceByKey(foundKey, options);
    }
  }

  return {
    success: false,
    key: '',
    locale: options.locale ?? i18nState.locale,
    error: 'No i18n key found for this element',
  };
}

/**
 * 打开源文件（内部函数）
 */
async function openSource(key: string) {
  const locale = i18nState.locale;

  if (import.meta.env?.DEV) {
    // 开发模式：通过 Vite server 打开 VS Code
    try {
      const response = await fetch('/__i18n_open_source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, locale }),
      });

      const result = await response.json();

      if (result.success) {
        console.log(`[i18n] Opening ${result.file}:${result.line}`);
      } else {
        console.warn(`[i18n] Key not found: ${key}`);
      }
    } catch (err) {
      console.error('[i18n] Failed to open source:', err);
    }
  } else if (config.repoUrl && config.lineIndex) {
    // 生产模式：跳转到 GitHub/GitLab (带行号)
    const messagesPath = config.repoMessagesPath ?? 'src/messages';
    const branch = config.branch ?? 'main';

    // 从 lineIndex 获取文件和行号
    const localeIndex = config.lineIndex[locale];
    const keyInfo = localeIndex?.[key];

    if (keyInfo) {
      const { file, line } = keyInfo;
      // GitHub URL 格式: repo/blob/branch/path/to/file.json#L行号
      const url = `${config.repoUrl}/blob/${branch}/${messagesPath}/${locale}/${file}#L${line}`;
      window.open(url, '_blank');
      console.log(`[i18n] Opening GitHub: ${file}:${line}`);
    } else {
      console.warn(`[i18n] Key not found in lineIndex: ${key}`);
    }
  }
}

/**
 * 创建 Svelte action 用于标记可点击的翻译元素
 */
export function i18nKey(node: HTMLElement, key: string) {
  if (import.meta.env?.DEV) {
    node.dataset.i18nKey = key;
    node.style.cursor = 'help';
  }

  return {
    update(newKey: string) {
      if (import.meta.env?.DEV) {
        node.dataset.i18nKey = newKey;
      }
    },
    destroy() {
      if (import.meta.env?.DEV) {
        delete node.dataset.i18nKey;
      }
    },
  };
}

/**
 * 清理开发工具
 */
export function destroyDevTools() {
  if (typeof window === 'undefined') return;
  document.removeEventListener('click', handleAltClick);
  initialized = false;
}
