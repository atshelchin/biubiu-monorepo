import type { LayoutServerLoad } from './$types';
import { i18nState } from '@shelchin/i18n';

export const load: LayoutServerLoad = async ({ locals }) => {
  // 从 hooks.server.ts 中获取已加载的消息和 locale
  return {
    locale: locals.locale || 'zh',
    messages: { ...i18nState.messages },
  };
};
