import { i18nState } from '../core/state.svelte.js';

export interface DateFormatOptions {
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  timeStyle?: 'full' | 'long' | 'medium' | 'short';
  /** 覆盖偏好中的时区 */
  timeZone?: string;
}

/**
 * 格式化日期
 */
export function formatDate(
  date: Date | number | string,
  options?: DateFormatOptions
): string {
  const { dateLocale, timezone } = i18nState.preferences;

  const dateObj = date instanceof Date ? date : new Date(date);

  const intlOptions: Intl.DateTimeFormatOptions = {
    timeZone: options?.timeZone ?? timezone,
  };

  if (options?.dateStyle) {
    intlOptions.dateStyle = options.dateStyle;
  }

  if (options?.timeStyle) {
    intlOptions.timeStyle = options.timeStyle;
  }

  // 如果没有指定任何样式，使用默认
  if (!options?.dateStyle && !options?.timeStyle) {
    intlOptions.dateStyle = 'medium';
  }

  return new Intl.DateTimeFormat(dateLocale, intlOptions).format(dateObj);
}

/**
 * 格式化日期时间
 */
export function formatDateTime(
  date: Date | number | string,
  options?: Omit<DateFormatOptions, 'dateStyle' | 'timeStyle'> & {
    dateStyle?: DateFormatOptions['dateStyle'];
    timeStyle?: DateFormatOptions['timeStyle'];
  }
): string {
  return formatDate(date, {
    dateStyle: options?.dateStyle ?? 'medium',
    timeStyle: options?.timeStyle ?? 'short',
    timeZone: options?.timeZone,
  });
}

/**
 * 格式化相对时间
 * 如: 3 天前, 2 小时后
 */
export function formatRelativeTime(
  date: Date | number,
  baseDate: Date | number = Date.now()
): string {
  const { dateLocale } = i18nState.preferences;

  const targetMs = date instanceof Date ? date.getTime() : date;
  const baseMs = baseDate instanceof Date ? baseDate.getTime() : baseDate;
  const diffMs = targetMs - baseMs;

  const seconds = Math.round(diffMs / 1000);
  const minutes = Math.round(diffMs / (1000 * 60));
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.round(diffMs / (1000 * 60 * 60 * 24 * 7));
  const months = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30));
  const years = Math.round(diffMs / (1000 * 60 * 60 * 24 * 365));

  const rtf = new Intl.RelativeTimeFormat(dateLocale, { numeric: 'auto' });

  if (Math.abs(seconds) < 60) {
    return rtf.format(seconds, 'second');
  }
  if (Math.abs(minutes) < 60) {
    return rtf.format(minutes, 'minute');
  }
  if (Math.abs(hours) < 24) {
    return rtf.format(hours, 'hour');
  }
  if (Math.abs(days) < 7) {
    return rtf.format(days, 'day');
  }
  if (Math.abs(weeks) < 4) {
    return rtf.format(weeks, 'week');
  }
  if (Math.abs(months) < 12) {
    return rtf.format(months, 'month');
  }
  return rtf.format(years, 'year');
}

/**
 * 获取当前时区的时间
 */
export function getTimezoneDate(date: Date = new Date()): string {
  const { timezone } = i18nState.preferences;

  return date.toLocaleString('en-US', { timeZone: timezone });
}
