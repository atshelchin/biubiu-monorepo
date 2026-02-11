import type { Preferences, Messages, I18nConfig } from './types.js';

/** 默认偏好 */
const defaultPreferences: Preferences = {
  locale: 'zh-CN',
  numberLocale: 'zh-CN',
  currency: 'CNY',
  dateLocale: 'zh-CN',
  timezone: 'Asia/Shanghai',
};

/** 全局 i18n 状态 */
class I18nState {
  preferences = $state<Preferences>({ ...defaultPreferences });
  messages = $state<Messages>({});
  config = $state<I18nConfig>({
    defaultLocale: 'zh-CN',
    fallbackLocale: 'en',
  });

  /** 当前 locale 快捷访问 */
  get locale() {
    return this.preferences.locale;
  }

  set locale(value: string) {
    this.preferences.locale = value;
  }

  /** 数字格式化器 (派生) */
  get numberFormatter() {
    return new Intl.NumberFormat(this.preferences.numberLocale);
  }

  /** 货币格式化器 (派生) */
  get currencyFormatter() {
    return new Intl.NumberFormat(this.preferences.numberLocale, {
      style: 'currency',
      currency: this.preferences.currency,
    });
  }

  /** 日期格式化器 (派生) */
  get dateFormatter() {
    return new Intl.DateTimeFormat(this.preferences.dateLocale, {
      timeZone: this.preferences.timezone,
    });
  }

  /** 初始化配置 */
  init(config: I18nConfig) {
    this.config = config;
    this.preferences = {
      ...defaultPreferences,
      locale: config.defaultLocale,
      ...config.preferences,
    };
  }

  /** 设置消息 */
  setMessages(messages: Messages) {
    this.messages = messages;
  }

  /** 合并消息 */
  mergeMessages(messages: Messages) {
    this.messages = { ...this.messages, ...messages };
  }

  /** 获取消息 */
  getMessage(key: string): string | undefined {
    return this.messages[key];
  }
}

/** 单例实例 */
export const i18nState = new I18nState();

/** 导出便捷访问器 */
export const preferences = {
  get value() { return i18nState.preferences; },
  set value(v: Preferences) { i18nState.preferences = v; },
  get locale() { return i18nState.preferences.locale; },
  set locale(v: string) { i18nState.preferences.locale = v; },
  get numberLocale() { return i18nState.preferences.numberLocale; },
  set numberLocale(v: string) { i18nState.preferences.numberLocale = v; },
  get currency() { return i18nState.preferences.currency; },
  set currency(v: string) { i18nState.preferences.currency = v; },
  get dateLocale() { return i18nState.preferences.dateLocale; },
  set dateLocale(v: string) { i18nState.preferences.dateLocale = v; },
  get timezone() { return i18nState.preferences.timezone; },
  set timezone(v: string) { i18nState.preferences.timezone = v; },
};

export const locale = {
  get value() { return i18nState.locale; },
  set value(v: string) { i18nState.locale = v; },
  set(v: string) { i18nState.locale = v; },
};
