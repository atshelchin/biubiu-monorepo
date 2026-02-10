import type { LayoutServerLoad } from './$types';
import { i18nState } from '@shelchin/i18n';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    locale: locals.locale || 'en',
    messages: { ...i18nState.messages },
  };
};
