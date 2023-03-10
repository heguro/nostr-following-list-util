import en from './i18n/en.json';
import ja from './i18n/ja.json';

// prettier-ignore
const langs = new Map([
  ['en', new Map<keyof typeof en, string>(Object.entries(en) as [keyof typeof en, string][])],
  ['ja', new Map<keyof typeof ja, string>(Object.entries(ja) as [keyof typeof ja, string][])],
]);

export const t = (
  key: keyof typeof en | keyof typeof ja,
  ...param: (string | number)[]
) => {
  // const prefsContextValue = useContext(PrefsContext);
  const lang =
    navigator.languages.find(
      lang => lang.startsWith('en') || lang.startsWith('ja'),
    ) || 'en-US';

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
