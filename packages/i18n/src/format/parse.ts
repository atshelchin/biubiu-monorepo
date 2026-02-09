import { i18nState } from '../core/state.svelte.js';

/**
 * 获取 locale 的数字分隔符
 */
function getSeparators(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
  return {
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
  };
}

/**
 * 解析本地化数字字符串为标准数字字符串
 *
 * 根据用户的 numberLocale 偏好：
 * - 德语格式 1.234,56 → 1234.56
 * - 法语格式 1 234,56 → 1234.56
 * - 中文格式 1,234.56 → 1234.56
 */
export function parseNumber(input: string, locale?: string): string {
  const targetLocale = locale ?? i18nState.preferences.numberLocale;
  const { group, decimal } = getSeparators(targetLocale);

  // 移除货币符号和空格 (保留数字、分隔符、负号)
  let cleaned = input.replace(/[^\d\-\s]/g, (char) => {
    if (char === group || char === decimal) return char;
    return '';
  });

  // 移除千分位分隔符
  if (group) {
    // 转义特殊正则字符
    const escapedGroup = group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(escapedGroup, 'g'), '');
  }

  // 空格作为千分位 (法语)
  cleaned = cleaned.replace(/\s/g, '');

  // 将本地小数点替换为标准点
  if (decimal && decimal !== '.') {
    cleaned = cleaned.replace(decimal, '.');
  }

  return cleaned;
}

/**
 * 解析本地化数字为 number 类型
 * 注意: 可能有精度损失，大数请使用 parseNumber 返回字符串
 */
export function parseNumberToFloat(input: string, locale?: string): number {
  const str = parseNumber(input, locale);
  return parseFloat(str);
}

/**
 * 解析本地化数字为 BigInt
 * 只支持整数
 */
export function parseNumberToBigInt(input: string, locale?: string): bigint {
  const str = parseNumber(input, locale);
  // 移除小数部分
  const intPart = str.split('.')[0];
  return BigInt(intPart);
}

/**
 * 验证输入是否为有效的本地化数字
 */
export function isValidLocalizedNumber(input: string, locale?: string): boolean {
  const targetLocale = locale ?? i18nState.preferences.numberLocale;
  const { group, decimal } = getSeparators(targetLocale);

  // 构建允许的字符正则
  const escapedGroup = group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedDecimal = decimal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const pattern = new RegExp(
    `^-?[\\d${escapedGroup}\\s]*(${escapedDecimal}\\d+)?$`
  );

  return pattern.test(input.trim());
}

/**
 * 格式化输入时实时添加千分位 (用于 input masking)
 */
export function maskNumberInput(input: string, locale?: string): string {
  const targetLocale = locale ?? i18nState.preferences.numberLocale;
  const { group, decimal } = getSeparators(targetLocale);

  // 解析为标准格式
  const parsed = parseNumber(input, targetLocale);

  if (!parsed || parsed === '-') return input;

  // 分离整数和小数
  const [intPart, decPart] = parsed.split('.');

  // 添加千分位
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, group);

  // 组装
  return decPart !== undefined
    ? `${formattedInt}${decimal}${decPart}`
    : formattedInt;
}
