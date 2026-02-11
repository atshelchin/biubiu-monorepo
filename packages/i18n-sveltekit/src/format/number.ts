import { i18nState } from '../core/state.svelte.js';

export interface NumberFormatOptions {
  style?: 'decimal' | 'currency' | 'percent';
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** 有效数字位数 (用于极小数如 0.00000000456) */
  significantDigits?: number;
  /** 使用分组 (千分位) */
  useGrouping?: boolean;
}

/**
 * 获取 locale 的分隔符
 */
function getSeparators(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
  return {
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
  };
}

/**
 * 为整数部分添加千分位分隔符
 */
function addGroupSeparator(intPart: string, groupSep: string): string {
  // 处理负号
  const isNegative = intPart.startsWith('-');
  const digits = isNegative ? intPart.slice(1) : intPart;

  // 从右往左每三位加分隔符
  const result = digits.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep);

  return isNegative ? `-${result}` : result;
}

/**
 * 格式化 BigInt 或大数字符串
 * 内部不使用 Number 类型，避免精度损失
 */
export function formatBigInt(
  value: bigint | string,
  locale: string,
  options?: NumberFormatOptions
): string {
  const str = typeof value === 'bigint' ? value.toString() : value;
  const { group, decimal } = getSeparators(locale);

  // 分离整数和小数部分
  const [intPart, decPart] = str.split('.');

  // 添加千分位
  const formattedInt =
    options?.useGrouping !== false ? addGroupSeparator(intPart, group) : intPart;

  // 组装结果
  let result = decPart ? `${formattedInt}${decimal}${decPart}` : formattedInt;

  // 货币格式
  if (options?.style === 'currency') {
    const currency = options.currency ?? i18nState.preferences.currency;
    const currencyFormatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    });
    // 获取货币符号
    const symbolPart = currencyFormatter
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    const symbol = symbolPart?.value ?? currency;
    result = `${symbol}${result}`;
  }

  return result;
}

/**
 * 格式化数字 (支持 number, bigint, string)
 */
export function formatNumber(
  value: number | bigint | string,
  options?: NumberFormatOptions
): string {
  const locale = i18nState.preferences.numberLocale;

  // BigInt 或字符串大数：手动格式化
  if (typeof value === 'bigint' || typeof value === 'string') {
    return formatBigInt(value, locale, options);
  }

  // 处理有效数字 (用于极小数)
  if (options?.significantDigits && value !== 0) {
    const formatted = value.toLocaleString(locale, {
      maximumSignificantDigits: options.significantDigits,
      minimumSignificantDigits: options.significantDigits,
    });
    return formatted;
  }

  // 普通 number：使用 Intl
  const intlOptions: Intl.NumberFormatOptions = {
    style: options?.style ?? 'decimal',
    useGrouping: options?.useGrouping ?? true,
  };

  if (options?.style === 'currency') {
    intlOptions.currency = options.currency ?? i18nState.preferences.currency;
  }

  if (options?.minimumFractionDigits !== undefined) {
    intlOptions.minimumFractionDigits = options.minimumFractionDigits;
  }

  if (options?.maximumFractionDigits !== undefined) {
    intlOptions.maximumFractionDigits = options.maximumFractionDigits;
  }

  return new Intl.NumberFormat(locale, intlOptions).format(value);
}

/**
 * 格式化货币 (快捷方法)
 */
export function formatCurrency(
  value: number | bigint | string,
  currency?: string
): string {
  return formatNumber(value, { style: 'currency', currency });
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number, fractionDigits = 2): string {
  const locale = i18nState.preferences.numberLocale;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}
