import { i18nState } from './state.svelte.js';
import type { InterpolateParams } from './types.js';

/**
 * 插值替换
 * 支持: {name}, {count} 等简单插值
 */
function interpolate(template: string, params?: InterpolateParams): string {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key];
    if (value === undefined) return `{${key}}`;
    return String(value);
  });
}

/**
 * 解析 ICU 复数语法
 * 格式: {count, plural, =0 {没有} =1 {一个} other {# 个}}
 */
function parsePlural(template: string, params?: InterpolateParams): string {
  if (!params) return template;

  const pluralMatch = template.match(/\{(\w+),\s*plural,\s*(.+)\}/);
  if (!pluralMatch) return template;

  const [fullMatch, countKey, rules] = pluralMatch;
  const count = Number(params[countKey]);

  if (isNaN(count)) return template;

  // 解析规则: =0 {没有} =1 {一个} other {# 个}
  const ruleRegex = /(?:=(\d+)|(\w+))\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  let result: string | null = null;
  let otherResult: string | null = null;

  while ((match = ruleRegex.exec(rules)) !== null) {
    const [, exactNum, keyword, text] = match;

    if (exactNum !== undefined && Number(exactNum) === count) {
      result = text;
      break;
    }

    if (keyword === 'other') {
      otherResult = text;
    } else if (keyword === 'one' && count === 1) {
      result = text;
    } else if (keyword === 'zero' && count === 0) {
      result = text;
    }
  }

  const finalResult = result ?? otherResult ?? '';
  // 替换 # 为实际数字
  const replaced = finalResult.replace(/#/g, String(count));

  return template.replace(fullMatch, replaced);
}

/**
 * 翻译函数
 */
export function t(key: string, params?: InterpolateParams): string {
  const message = i18nState.getMessage(key);

  if (!message) {
    // 开发模式显示 key，生产模式返回空或 key
    if (typeof window !== 'undefined' && import.meta.env?.DEV) {
      console.warn(`[i18n] Missing translation: ${key}`);
    }
    return key;
  }

  // 先处理复数，再处理插值
  let result = parsePlural(message, params);
  result = interpolate(result, params);

  return result;
}

/**
 * 创建带有 key 标记的翻译函数 (用于 devtools Alt+Click)
 */
export function createT() {
  return (key: string, params?: InterpolateParams) => t(key, params);
}
