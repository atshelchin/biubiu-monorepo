/** 5 维度偏好模型 */
export interface Preferences {
  /** UI 语言，决定加载哪个 JSON */
  locale: string;
  /** 数字格式化 locale (千分位、小数点符号) */
  numberLocale: string;
  /** 货币符号 */
  currency: string;
  /** 日期格式化 locale */
  dateLocale: string;
  /** 时区 */
  timezone: string;
}

/** i18n 配置 */
export interface I18nConfig {
  defaultLocale: string;
  fallbackLocale: string;
  preferences?: Partial<Preferences>;
  /** 消息目录路径 (相对于项目根目录) */
  messagesDir?: string;
}

/** 消息字典 */
export type Messages = Record<string, string>;

/** 路由消息映射 */
export type RouteMessages = Record<string, string[]>;

/** 行号索引 */
export type LineIndex = Record<string, Record<string, { file: string; line: number }>>;

/** 插值参数 */
export type InterpolateParams = Record<string, string | number | bigint>;
