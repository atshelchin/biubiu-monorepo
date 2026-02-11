import { readdir, stat } from 'node:fs/promises';
import { join, relative, dirname, basename } from 'node:path';
import type { RouteMessages } from '../core/types.js';

export interface ScanResult {
  /** 所有 locale 列表 */
  locales: string[];
  /** 路由到命名空间的映射 */
  routeMessages: RouteMessages;
  /** 所有文件路径 { locale: { namespace: filePath } } */
  files: Record<string, Record<string, string>>;
}

/**
 * 递归扫描目录
 */
async function walkDir(dir: string, base = ''): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relativePath = base ? `${base}/${entry}` : entry;
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        files.push(...(await walkDir(fullPath, relativePath)));
      } else if (entry.endsWith('.json')) {
        files.push(relativePath);
      }
    }
  } catch {
    // 目录不存在
  }

  return files;
}

// 全局命名空间文件名 (使用下划线前缀，不作为路由)
const GLOBAL_NAMESPACE = '_global';

/**
 * 将文件路径转换为路由模式
 * dashboard/settings.json → /dashboard/settings
 * user/[id].json → /user/[id]
 * _layout.json → (layout marker)
 * global.json → (global namespace, skip)
 */
function fileToRoute(filePath: string): { route: string; isLayout: boolean; isGlobal: boolean } {
  const name = basename(filePath, '.json');
  const dir = dirname(filePath);

  const isLayout = name === '_layout';
  const isGlobal = name === GLOBAL_NAMESPACE && dir === '.';
  const routeName = isLayout || isGlobal ? '' : name;
  const route = dir === '.' ? `/${routeName}` : `/${dir}${routeName ? '/' + routeName : ''}`;

  return {
    route: route.replace(/\/+/g, '/').replace(/\/$/, '') || '/',
    isLayout,
    isGlobal,
  };
}

/**
 * 为路由构建命名空间列表
 * /dashboard/settings → ['global', 'dashboard/_layout', 'dashboard/settings']
 */
function buildNamespaceChain(route: string, allFiles: string[]): string[] {
  const namespaces: string[] = [GLOBAL_NAMESPACE];

  if (route === '/') return namespaces;

  const parts = route.split('/').filter(Boolean);
  let currentPath = '';

  for (let i = 0; i < parts.length; i++) {
    currentPath += (currentPath ? '/' : '') + parts[i];

    // 检查 _layout
    const layoutFile = `${currentPath}/_layout.json`;
    if (allFiles.includes(layoutFile)) {
      namespaces.push(currentPath + '/_layout');
    }

    // 最后一个部分是页面本身
    if (i === parts.length - 1) {
      const pageFile = `${currentPath}.json`;
      if (allFiles.includes(pageFile)) {
        namespaces.push(currentPath);
      }
    }
  }

  return namespaces;
}

/**
 * 扫描 messages 目录
 */
export async function scanMessages(messagesDir: string): Promise<ScanResult> {
  const locales: string[] = [];
  const files: Record<string, Record<string, string>> = {};
  const routeMessages: RouteMessages = {};

  // 扫描第一层获取 locales
  try {
    const entries = await readdir(messagesDir);
    for (const entry of entries) {
      const entryPath = join(messagesDir, entry);
      const stats = await stat(entryPath);
      if (stats.isDirectory()) {
        locales.push(entry);
      }
    }
  } catch {
    return { locales: [], routeMessages: {}, files: {} };
  }

  if (locales.length === 0) {
    return { locales: [], routeMessages: {}, files: {} };
  }

  // 使用第一个 locale 作为参考来生成路由映射
  const referenceLocale = locales[0];
  const referenceDir = join(messagesDir, referenceLocale);
  const allFiles = await walkDir(referenceDir);

  // 扫描所有 locale 的文件
  for (const locale of locales) {
    const localeDir = join(messagesDir, locale);
    const localeFiles = await walkDir(localeDir);

    files[locale] = {};
    for (const file of localeFiles) {
      const namespace = file.replace(/\.json$/, '');
      files[locale][namespace] = join(localeDir, file);
    }
  }

  // 生成路由映射
  for (const file of allFiles) {
    const { route, isLayout, isGlobal } = fileToRoute(file);

    // 跳过布局和全局命名空间文件
    if (!isLayout && !isGlobal && !routeMessages[route]) {
      routeMessages[route] = buildNamespaceChain(route, allFiles);
    }
  }

  // 确保根路由存在
  if (!routeMessages['/']) {
    routeMessages['/'] = [GLOBAL_NAMESPACE];
  }

  return { locales, routeMessages, files };
}
