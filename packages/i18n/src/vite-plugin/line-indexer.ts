import { readFile } from 'node:fs/promises';
import type { LineIndex } from '../core/types.js';

/**
 * 解析 JSON 并记录每个 key 的行号
 *
 * @param content - JSON 文件内容
 * @param relativePath - 相对于 locale 目录的路径 (如 dashboard/_layout.json)
 */
export function indexJsonLines(
  content: string,
  relativePath: string
): Record<string, { file: string; line: number }> {
  const result: Record<string, { file: string; line: number }> = {};
  const lines = content.split('\n');

  const keyPattern = /^\s*"([^"]+)"\s*:/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(keyPattern);

    if (match) {
      const key = match[1];

      result[key] = {
        file: relativePath,
        line: i + 1,
      };
    }
  }

  return result;
}

/**
 * 为所有文件生成行号索引
 * @param files - { locale: { namespace: absoluteFilePath } }
 */
export async function generateLineIndex(
  files: Record<string, Record<string, string>>
): Promise<LineIndex> {
  const index: LineIndex = {};

  for (const [locale, namespaces] of Object.entries(files)) {
    index[locale] = {};

    for (const [namespace, filePath] of Object.entries(namespaces)) {
      try {
        const content = await readFile(filePath, 'utf-8');

        // 计算相对于 locale 目录的路径
        // namespace 格式如: _global, settings, dashboard/_layout
        const relativePath = namespace.includes('/')
          ? `${namespace}.json`
          : `${namespace}.json`;

        const fileIndex = indexJsonLines(content, relativePath);

        Object.assign(index[locale], fileIndex);
      } catch {
        // 文件不存在或读取失败
      }
    }
  }

  return index;
}

/**
 * 生成行号索引的 JS 代码
 */
export function generateLineIndexCode(index: LineIndex): string {
  return `export const lineIndex = ${JSON.stringify(index, null, 2)};`;
}
