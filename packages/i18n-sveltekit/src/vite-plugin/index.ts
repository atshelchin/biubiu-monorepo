import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { exec } from 'node:child_process';
import type { Plugin, ViteDevServer } from 'vite';
import { scanMessages } from './scanner.js';
import { generateLineIndex, generateLineIndexCode } from './line-indexer.js';
import { collectAllKeys, generateTypeDefinition, generateRouteMessagesCode } from './type-gen.js';

export interface I18nPluginOptions {
  /** 消息文件目录 (相对于项目根目录) */
  messagesDir?: string;
  /** 生成的类型文件目录 */
  outDir?: string;
  /** GitHub/GitLab 仓库 URL (用于生产环境 Alt+Click) */
  repoUrl?: string;
  /** 消息文件在仓库中的路径前缀 */
  repoMessagesPath?: string;
}

const VIRTUAL_MODULES = {
  routes: '$i18n/routes',
  lineIndex: '$i18n/line-index',
};

export function i18nPlugin(options: I18nPluginOptions = {}): Plugin {
  const messagesDir = options.messagesDir ?? 'messages';
  const outDir = options.outDir ?? '.svelte-kit/types/$i18n';

  let root: string;
  let messagesDirAbsolute: string;
  let outDirAbsolute: string;
  let scanResult: Awaited<ReturnType<typeof scanMessages>>;
  let lineIndex: Awaited<ReturnType<typeof generateLineIndex>>;

  async function generateFiles() {
    // 扫描消息文件
    scanResult = await scanMessages(messagesDirAbsolute);

    if (scanResult.locales.length === 0) {
      console.warn('[i18n] No messages found in', messagesDirAbsolute);
      return;
    }

    // 生成行号索引
    lineIndex = await generateLineIndex(scanResult.files);

    // 收集所有 key
    const allKeys = await collectAllKeys(scanResult.files);

    // 确保输出目录存在
    await mkdir(outDirAbsolute, { recursive: true });

    // 生成类型定义
    const typeDef = generateTypeDefinition(allKeys, scanResult.locales);
    await writeFile(join(outDirAbsolute, 'index.d.ts'), typeDef);

    // 生成路由映射
    const routesCode = generateRouteMessagesCode(scanResult.routeMessages);
    await writeFile(join(outDirAbsolute, 'routes.js'), routesCode);
    await writeFile(
      join(outDirAbsolute, 'routes.d.ts'),
      `export const routeMessages: Record<string, string[]>;`
    );

    // 生成行号索引
    const lineIndexCode = generateLineIndexCode(lineIndex);
    await writeFile(join(outDirAbsolute, 'line-index.js'), lineIndexCode);
    await writeFile(
      join(outDirAbsolute, 'line-index.d.ts'),
      `export const lineIndex: Record<string, Record<string, { file: string; line: number }>>;`
    );

    console.log(`[i18n] Generated types for ${allKeys.size} keys, ${scanResult.locales.length} locales`);
  }

  return {
    name: 'vite-plugin-i18n',

    configResolved(config) {
      root = config.root;
      messagesDirAbsolute = resolve(root, messagesDir);
      outDirAbsolute = resolve(root, outDir);
    },

    async buildStart() {
      await generateFiles();
    },

    configureServer(server: ViteDevServer) {
      // 监听消息文件变化
      server.watcher.add(messagesDirAbsolute);
      server.watcher.on('change', async (file) => {
        if (file.startsWith(messagesDirAbsolute)) {
          console.log('[i18n] Messages changed, regenerating...');
          await generateFiles();
        }
      });

      // Alt+Click 跳转中间件
      server.middlewares.use('/__i18n_open_source', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { key, locale } = JSON.parse(body);
            const keyInfo = lineIndex?.[locale]?.[key];

            if (keyInfo) {
              // 构建完整的文件路径 (lineIndex 只存储相对路径)
              const fullPath = join(messagesDirAbsolute, locale, keyInfo.file);
              // 打开 VS Code
              const cmd = `code --goto "${fullPath}:${keyInfo.line}"`;
              exec(cmd, (err) => {
                if (err) {
                  console.error('[i18n] Failed to open editor:', err);
                }
              });
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, file: fullPath, line: keyInfo.line }));
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Key not found' }));
            }
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid request' }));
          }
        });
      });
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULES.routes) {
        return join(outDirAbsolute, 'routes.js');
      }
      if (id === VIRTUAL_MODULES.lineIndex) {
        return join(outDirAbsolute, 'line-index.js');
      }
      return null;
    },
  };
}

export default i18nPlugin;
