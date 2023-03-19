import en from './i18n/en.json';
import ja from './i18n/ja.json';

export type Language = 'en' | 'ja';
export const LangNames = new Map<Language, string>([
  ['en', en.___langName],
  ['ja', ja.___langName],
]);

export type I18nKey = keyof typeof en | keyof typeof ja;
export type I18nParams = (string | number)[];

// prettier-ignore
const langs = new Map([
  ['en', new Map<keyof typeof en, string>(Object.entries(en) as [keyof typeof en, string][])],
  ['ja', new Map<keyof typeof ja, string>(Object.entries(ja) as [keyof typeof ja, string][])],
]);

export const i18n = (
  language: Language | 'default',
  key: I18nKey,
  ...param: I18nParams
) => {
  const lang =
    language === 'default'
      ? navigator.languages.find(
          lang => lang.startsWith('en') || lang.startsWith('ja'),
        ) || 'en-US'
      : language;

  let text =
    (lang.startsWith('ja') && langs.get('ja')?.get(key)) ||
    langs.get('en')?.get(key) ||
    langs.get('ja')?.get(key) ||
    key;
  for (const [i, p] of param.entries()) {
    text = text.replace(`{${i}}`, p.toString());
  }
  return text;
};
