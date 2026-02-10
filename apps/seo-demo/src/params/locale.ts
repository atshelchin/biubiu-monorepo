import type { ParamMatcher } from '@sveltejs/kit';

const validLocales = ['en', 'zh'];

export const match: ParamMatcher = (param) => {
  return validLocales.includes(param);
};
